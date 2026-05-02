# Backup 設定與使用指南

## 目錄
- [初次設定（10 分鐘，只做一次）](#初次設定)
- [日常使用](#日常使用)
- [啟用每週自動備份](#啟用每週自動備份)
- [災難還原（給 Claude 用的指示）](#災難還原)

---

## 初次設定

### 步驟 1：安裝 pg_dump

打開 Terminal：

```bash
brew install postgresql@17
```

安裝完驗證：

```bash
/opt/homebrew/opt/postgresql@17/bin/pg_dump --version
# 應該顯示: pg_dump (PostgreSQL) 17.x
```

### 步驟 2：取得資料庫密碼

1. 開啟 https://supabase.com/dashboard/project/insaqafqbbunziratdxe/settings/database
2. 找 **Database password** 區塊
3. 如果忘記了 → 點 **Reset database password**，設新密碼，複製
4. 如果有設過但沒記錄 → 也點 Reset 重設一個（立即生效，不影響現有服務）

### 步驟 3：把密碼加入 `.env.local`

在專案根目錄 `examproadmin/.env.local` 最下方加上：

```
SUPABASE_DB_PASSWORD=你剛才複製的密碼
```

⚠️ 注意：`.env.local` 已經在 `.gitignore` 裡，**絕對不會**被推上 GitHub。

### 步驟 4：測試備份一次

```bash
cd "/Users/myhsieh/02 ExamPro Series/題庫開發/examproadmin"
./backup.sh
```

第一次執行預期：
- 會下載全部 1,058 張圖片（~幾分鐘）
- 產生 pg_dump（幾秒）
- 在 `~/Library/Mobile Documents/com~apple~CloudDocs/ExamProBackups/YYYYMMDD_HHMM/` 出現一個資料夾

開 Finder 進 iCloud Drive → ExamProBackups，應該看到：
```
20260420_2200/
├── db.sql.gz          ← 整個資料庫（schema + data）
├── manifest.txt        ← 備份摘要
└── storage/
    ├── carlic/         ← 377 張
    ├── dentexam1/      ← 115 張
    ├── mdexam1/        ← 28 張
    ├── mdexam2/        ← 250 張
    ├── motorlic/       ← 216 張
    └── npexam/         ← 72 張
```

---

## 日常使用

### 手動執行全備份
```bash
cd "/Users/myhsieh/02 ExamPro Series/題庫開發/examproadmin"
./backup.sh
```

### 只備份資料庫（跳過圖片，較快）
```bash
./backup.sh --db-only
```

### 只備份圖片（更新了圖片時用）
```bash
./backup.sh --storage-only
```

### 透過網站快速備份 JSON
- 登入 examproadmin.vercel.app → **Import/Export** → **Backup** 分頁
- 按「Download Full Backup」下載 JSON
- ⚠️ 網站備份**只有資料**，沒有 schema、沒有圖片 — 日常小備份可以，災難還原不夠用

---

## 啟用每週自動備份

每週日凌晨 2 點自動執行，執行結果寫到 `/tmp/examproadmin_backup.log`。Mac 如果在睡眠，會在下次醒來後補跑。

### 啟用
```bash
# 複製 plist 到系統 LaunchAgents 資料夾
cp "/Users/myhsieh/02 ExamPro Series/題庫開發/examproadmin/com.examproadmin.backup.plist" \
   ~/Library/LaunchAgents/

# 載入排程
launchctl load ~/Library/LaunchAgents/com.examproadmin.backup.plist
```

### 驗證已啟用
```bash
launchctl list | grep examproadmin
# 應該看到: -    0    com.examproadmin.backup
```

### 測試立即執行（不等到週日）
```bash
launchctl start com.examproadmin.backup
# 幾分鐘後檢查 /tmp/examproadmin_backup.log
```

### 停用自動備份
```bash
launchctl unload ~/Library/LaunchAgents/com.examproadmin.backup.plist
```

### 修改執行時間
編輯 `~/Library/LaunchAgents/com.examproadmin.backup.plist`，找到：
```xml
<key>StartCalendarInterval</key>
<dict>
    <key>Weekday</key>
    <integer>0</integer>     <!-- 0=週日, 1=週一, ..., 6=週六 -->
    <key>Hour</key>
    <integer>2</integer>      <!-- 0-23 -->
    <key>Minute</key>
    <integer>0</integer>       <!-- 0-59 -->
</dict>
```

改完後：
```bash
launchctl unload ~/Library/LaunchAgents/com.examproadmin.backup.plist
launchctl load ~/Library/LaunchAgents/com.examproadmin.backup.plist
```

---

## 災難還原

**此章節是給 Claude 參考用的**。若資料庫毀損/專案刪除，把最新備份資料夾整個傳給 Claude，並貼上以下指示：

### 還原前檢查清單
- [ ] Supabase 新專案已建立（或原專案 Reset）
- [ ] 新專案的 `.env.local` 已更新（URL, anon key, service role key, 加密金鑰）
- [ ] 備份資料夾完整（含 db.sql.gz, storage/, manifest.txt）

### 還原步驟（Claude 執行）

**1. 還原資料庫**
```bash
# 解壓 SQL
gunzip -c db.sql.gz > db.sql

# 用 psql 執行
psql "postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres" -f db.sql
```

或者：把 db.sql 內容貼到 Supabase Dashboard → SQL Editor 執行

**2. 還原 Storage 圖片**

對每個子資料夾（carlic, mdexam1, ...）：
```bash
# 先在 Supabase Dashboard → Storage 建立 'question-images' bucket (public)
# 然後用 Python 批次上傳
python3 << 'EOF'
import os, requests
URL = "https://PROJECT_REF.supabase.co"
KEY = "SERVICE_ROLE_KEY"
STORAGE_DIR = "./storage"

for folder in os.listdir(STORAGE_DIR):
    fdir = os.path.join(STORAGE_DIR, folder)
    if not os.path.isdir(fdir): continue
    for fname in os.listdir(fdir):
        local = os.path.join(fdir, fname)
        remote = f"{folder}/{fname}"
        with open(local, 'rb') as f:
            r = requests.post(
                f"{URL}/storage/v1/object/question-images/{remote}",
                headers={"apikey": KEY, "Authorization": f"Bearer {KEY}",
                         "Content-Type": "image/png"},
                data=f.read()
            )
            print(f"{remote}: {r.status_code}")
EOF
```

**3. 驗證**
- 跑 examproadmin 網站 → 應該看到所有題庫
- 隨機開幾題有圖片的 → 確認圖片顯示正常
- 測試 AI 詳解解密 → 確認加密金鑰一致

---

## 備份檔案結構說明

```
~/Library/Mobile Documents/com~apple~CloudDocs/ExamProBackups/
├── 20260420_2200/
│   ├── db.sql.gz              # pg_dump 壓縮檔
│   ├── manifest.txt           # 備份摘要（時間、大小、檔案數）
│   └── storage/               # Storage bucket 完整複製
│       ├── carlic/
│       ├── dentexam1/
│       ├── mdexam1/
│       ├── mdexam2/
│       ├── motorlic/
│       └── npexam/
├── 20260427_0200/  (下週自動備份)
└── ...
```

自動保留最近 **12 份**，超過的會自動刪除（約 3 個月歷史）。
