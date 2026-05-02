#!/usr/bin/env bash
# =====================================================================
# ExamPro Admin — Full Supabase Backup Script
#
# Creates a complete, restore-capable backup consisting of:
#   1. pg_dump (schema + data) → .sql.gz
#   2. Storage bucket 'question-images' → folder tree
#   3. manifest.txt → summary for Claude to verify backup integrity
#
# Usage:
#   ./backup.sh              Full backup (default)
#   ./backup.sh --db-only    Only pg_dump (skip storage)
#   ./backup.sh --storage-only  Only storage images (skip pg_dump)
#
# Requirements (one-time setup):
#   - brew install postgresql@17
#   - Set SUPABASE_DB_PASSWORD in .env.local
#     (get from Supabase Dashboard → Project Settings → Database)
#
# Output:
#   ~/Library/Mobile Documents/com~apple~CloudDocs/ExamProBackups/YYYYMMDD_HHMM/
# =====================================================================

set -euo pipefail

# --- Configuration ---
PROJECT_REF="insaqafqbbunziratdxe"
DB_USER="postgres.${PROJECT_REF}"
DB_HOST="aws-1-ap-northeast-1.pooler.supabase.com"
DB_PORT="5432"  # Session pooler — required for pg_dump (transaction pooler 6543 fails on multi-statement ops)
DB_NAME="postgres"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
STORAGE_BUCKET="question-images"

BACKUP_ROOT="$HOME/Library/Mobile Documents/com~apple~CloudDocs/ExamProBackups"

# --- Load credentials from .env.local ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.local"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: .env.local not found at $ENV_FILE"
    exit 1
fi

get_env() {
    grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d '=' -f2- | tr -d '"' | tr -d "'"
}

DB_PASSWORD=$(get_env "SUPABASE_DB_PASSWORD")
SERVICE_ROLE_KEY=$(get_env "SUPABASE_SERVICE_ROLE_KEY")

# --- Parse arguments ---
DO_DB=1
DO_STORAGE=1
case "${1:-}" in
    --db-only) DO_STORAGE=0 ;;
    --storage-only) DO_DB=0 ;;
    "") : ;;
    *)
        echo "Usage: $0 [--db-only|--storage-only]"
        exit 1
        ;;
esac

# --- Validate credentials ---
if [ "$DO_DB" -eq 1 ] && [ -z "$DB_PASSWORD" ]; then
    echo "❌ Error: SUPABASE_DB_PASSWORD not set in .env.local"
    echo ""
    echo "Get the password:"
    echo "  1. Open https://supabase.com/dashboard/project/$PROJECT_REF/settings/database"
    echo "  2. 'Database password' → copy or reset"
    echo "  3. Append to .env.local:"
    echo "     SUPABASE_DB_PASSWORD=your_password_here"
    exit 1
fi

if [ "$DO_STORAGE" -eq 1 ] && [ -z "$SERVICE_ROLE_KEY" ]; then
    echo "❌ Error: SUPABASE_SERVICE_ROLE_KEY not in .env.local"
    exit 1
fi

# --- Locate pg_dump (only needed if DO_DB) ---
PG_DUMP=""
if [ "$DO_DB" -eq 1 ]; then
    for candidate in \
        "/opt/homebrew/opt/postgresql@17/bin/pg_dump" \
        "/opt/homebrew/opt/postgresql/bin/pg_dump" \
        "/usr/local/opt/postgresql@17/bin/pg_dump" \
        "/usr/local/opt/postgresql/bin/pg_dump" \
        "$(command -v pg_dump 2>/dev/null || true)"
    do
        if [ -n "$candidate" ] && [ -x "$candidate" ]; then
            PG_DUMP="$candidate"
            break
        fi
    done
    if [ -z "$PG_DUMP" ]; then
        echo "❌ Error: pg_dump not found."
        echo "Install with: brew install postgresql@17"
        exit 1
    fi
fi

# --- Prepare backup folder ---
TIMESTAMP=$(date +%Y%m%d_%H%M)
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"

MANIFEST="$BACKUP_DIR/manifest.txt"
{
    echo "ExamPro Admin Backup"
    echo "===================="
    echo "Timestamp:     $(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo "Project ref:   $PROJECT_REF"
    echo "Backup dir:    $BACKUP_DIR"
    echo ""
} > "$MANIFEST"

echo "=================================="
echo "ExamPro Admin Backup"
echo "=================================="
echo "Timestamp: $TIMESTAMP"
echo "Destination: $BACKUP_DIR"
echo ""

# =====================================================================
# Part 1: pg_dump (schema + data)
# =====================================================================
if [ "$DO_DB" -eq 1 ]; then
    SQL_FILE="$BACKUP_DIR/db.sql.gz"
    echo "📦 [1/2] Running pg_dump..."

    export PGPASSWORD="$DB_PASSWORD"

    if "$PG_DUMP" \
        --host="$DB_HOST" \
        --port="$DB_PORT" \
        --username="$DB_USER" \
        --dbname="$DB_NAME" \
        --schema=public \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists \
        2>/tmp/pg_dump_err.log \
        | gzip > "$SQL_FILE"
    then
        unset PGPASSWORD
        SQL_SIZE=$(du -h "$SQL_FILE" | cut -f1)
        SQL_LINES=$(gunzip -c "$SQL_FILE" | wc -l | tr -d ' ')
        echo "   ✅ DB dump: $SQL_SIZE ($SQL_LINES lines)"

        {
            echo "--- Database ---"
            echo "File:   db.sql.gz"
            echo "Size:   $SQL_SIZE"
            echo "Lines:  $SQL_LINES"
            echo ""
        } >> "$MANIFEST"
    else
        unset PGPASSWORD
        echo "   ❌ pg_dump failed:"
        cat /tmp/pg_dump_err.log | tail -5 | sed 's/^/      /'
        {
            echo "--- Database ---"
            echo "STATUS: FAILED"
            cat /tmp/pg_dump_err.log
            echo ""
        } >> "$MANIFEST"
        rm -f "$SQL_FILE"
        exit 1
    fi
else
    echo "⏭  [1/2] Skipping pg_dump (--storage-only)"
fi

# =====================================================================
# Part 2: Storage bucket download
# =====================================================================
if [ "$DO_STORAGE" -eq 1 ]; then
    STORAGE_DIR="$BACKUP_DIR/storage"
    mkdir -p "$STORAGE_DIR"
    echo ""
    echo "📸 [2/2] Downloading storage bucket '$STORAGE_BUCKET'..."

    {
        echo "--- Storage ---"
        echo "Bucket: $STORAGE_BUCKET"
    } >> "$MANIFEST"

    TOTAL_FILES=0
    TOTAL_BYTES=0

    # List top-level folders
    TOP_LEVEL_JSON=$(curl -s -X POST \
        -H "apikey: $SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
        -H "Content-Type: application/json" \
        -d '{"limit":1000,"offset":0,"prefix":""}' \
        "$SUPABASE_URL/storage/v1/object/list/$STORAGE_BUCKET")

    # Extract folder names (entries where id is null)
    FOLDERS=$(echo "$TOP_LEVEL_JSON" | python3 -c "
import sys, json
try:
    entries = json.loads(sys.stdin.read())
    for e in entries:
        if e.get('id') is None:
            print(e.get('name',''))
except Exception as ex:
    print('', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null || echo "")

    if [ -z "$FOLDERS" ]; then
        echo "   ⚠️  No folders found in bucket (or API error)"
    fi

    for FOLDER in $FOLDERS; do
        [ -z "$FOLDER" ] && continue

        FOLDER_DIR="$STORAGE_DIR/$FOLDER"
        mkdir -p "$FOLDER_DIR"

        # List files in this folder (paginated, 100 per request)
        FOLDER_COUNT=0
        FOLDER_BYTES=0
        OFFSET=0
        while :; do
            FILES_JSON=$(curl -s -X POST \
                -H "apikey: $SERVICE_ROLE_KEY" \
                -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
                -H "Content-Type: application/json" \
                -d "{\"limit\":100,\"offset\":$OFFSET,\"prefix\":\"$FOLDER\"}" \
                "$SUPABASE_URL/storage/v1/object/list/$STORAGE_BUCKET")

            FILES=$(echo "$FILES_JSON" | python3 -c "
import sys, json
entries = json.loads(sys.stdin.read())
for e in entries:
    if e.get('id') is not None:
        print(e.get('name',''))
" 2>/dev/null || echo "")

            if [ -z "$FILES" ]; then
                break
            fi

            BATCH_COUNT=0
            while IFS= read -r FNAME; do
                [ -z "$FNAME" ] && continue
                OBJ_PATH="$FOLDER/$FNAME"
                DEST_PATH="$FOLDER_DIR/$FNAME"

                # Skip if already exists (rerunning same timestamp shouldn't re-download)
                if [ -f "$DEST_PATH" ] && [ -s "$DEST_PATH" ]; then
                    BATCH_COUNT=$((BATCH_COUNT + 1))
                    continue
                fi

                # Download (bucket is public, but use service role to be safe)
                HTTP_CODE=$(curl -s -o "$DEST_PATH" -w "%{http_code}" \
                    -H "apikey: $SERVICE_ROLE_KEY" \
                    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
                    "$SUPABASE_URL/storage/v1/object/$STORAGE_BUCKET/$OBJ_PATH")

                if [ "$HTTP_CODE" = "200" ] && [ -s "$DEST_PATH" ]; then
                    BATCH_COUNT=$((BATCH_COUNT + 1))
                    FSIZE=$(stat -f%z "$DEST_PATH" 2>/dev/null || stat -c%s "$DEST_PATH" 2>/dev/null || echo 0)
                    FOLDER_BYTES=$((FOLDER_BYTES + FSIZE))
                else
                    echo "   ⚠️  Failed to download $OBJ_PATH (HTTP $HTTP_CODE)"
                    rm -f "$DEST_PATH"
                fi
            done <<< "$FILES"

            FOLDER_COUNT=$((FOLDER_COUNT + BATCH_COUNT))

            # Check if we got a full page (means more to fetch)
            if [ "$BATCH_COUNT" -lt 100 ]; then
                break
            fi
            OFFSET=$((OFFSET + 100))
        done

        FOLDER_SIZE=$(du -sh "$FOLDER_DIR" 2>/dev/null | cut -f1)
        echo "   ✅ $FOLDER: $FOLDER_COUNT files ($FOLDER_SIZE)"
        echo "  $FOLDER: $FOLDER_COUNT files ($FOLDER_SIZE)" >> "$MANIFEST"

        TOTAL_FILES=$((TOTAL_FILES + FOLDER_COUNT))
        TOTAL_BYTES=$((TOTAL_BYTES + FOLDER_BYTES))
    done

    STORAGE_TOTAL=$(du -sh "$STORAGE_DIR" 2>/dev/null | cut -f1)
    echo ""
    echo "   Total: $TOTAL_FILES files, $STORAGE_TOTAL"

    {
        echo "Total files: $TOTAL_FILES"
        echo "Total size:  $STORAGE_TOTAL"
        echo ""
    } >> "$MANIFEST"
else
    echo "⏭  [2/2] Skipping storage (--db-only)"
fi

# =====================================================================
# Finalize
# =====================================================================
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
{
    echo "--- Summary ---"
    echo "Total backup size: $TOTAL_SIZE"
} >> "$MANIFEST"

echo ""
echo "=================================="
echo "✅ Backup complete"
echo "=================================="
echo "Location: $BACKUP_DIR"
echo "Total:    $TOTAL_SIZE"
echo ""

# --- Clean up old backups (keep newest 12) ---
BACKUP_COUNT=$(ls -1d "$BACKUP_ROOT"/[0-9]* 2>/dev/null | wc -l | tr -d ' ')
if [ "$BACKUP_COUNT" -gt 12 ]; then
    echo "🧹 Cleaning up old backups (keeping newest 12 of $BACKUP_COUNT)..."
    ls -1dt "$BACKUP_ROOT"/[0-9]* | tail -n +13 | while read -r OLD; do
        echo "   Removed: $(basename "$OLD")"
        rm -rf "$OLD"
    done
fi
