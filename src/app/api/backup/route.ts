import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// Tables to include in backup
const BACKUP_TABLES = [
  'apps',
  'categories',
  'questions',
  'sync_manifest',
  'admin_users',
  'ai_jobs',
  'feedback',
  'question_images',
] as const

/**
 * Full JSON backup of all tables.
 * GET /api/backup → downloads a gzipped JSON file
 *
 * NOTE: this backs up ALL tables via REST (paginated). Storage bucket
 * files are NOT included — use pg_dump via backup.sh for schema/triggers
 * and the Supabase Dashboard for storage backup.
 */
export async function GET(request: NextRequest) {
  const supabase = createServerClient()

  // Auth check — super_admin only
  const userId = request.headers.get('x-user-id')
  if (userId) {
    const { data: admin } = await supabase
      .from('admin_users').select('role').eq('id', userId).single()
    if (admin?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const format = request.nextUrl.searchParams.get('format') || 'json'

  const backup: Record<string, unknown[]> = {}
  const stats: Record<string, number> = {}
  const errors: Record<string, string> = {}

  for (const table of BACKUP_TABLES) {
    const rows: unknown[] = []
    let offset = 0
    const pageSize = 1000

    try {
      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .range(offset, offset + pageSize - 1)

        if (error) {
          errors[table] = error.message
          break
        }
        if (!data || data.length === 0) break
        rows.push(...data)
        if (data.length < pageSize) break
        offset += pageSize
      }
    } catch (err) {
      errors[table] = err instanceof Error ? err.message : 'Unknown error'
    }

    backup[table] = rows
    stats[table] = rows.length
  }

  const meta = {
    generated_at: new Date().toISOString(),
    project_ref: 'insaqafqbbunziratdxe',
    format_version: '1.0',
    note: 'JSON backup via admin API. For full schema/trigger backup, use backup.sh (pg_dump).',
    tables: BACKUP_TABLES,
    stats,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  }

  const payload = { meta, data: backup }

  // Timestamp in local (Asia/Taipei-ish) for filename — use ISO then trim
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '').replace(/-/g, '')
  const filename = `examproadmin_backup_${ts}.json`

  if (format === 'json') {
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
}
