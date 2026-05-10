# ExamPro Admin

題庫管理後台 — 為 ExamPro 系列 iOS app 提供題庫維護、AI 詳解生成、使用量監控、備份等管理功能。

🌐 **Live**: https://examproadmin.vercel.app

---

## 📊 題庫規模（截至 2026-05-11）

- **總題數**：**150,276** 題
- **App 數**：34 個（醫護國考、駕照筆試、導遊領隊等）
- **儲存**：Supabase PostgreSQL（Pro 方案）+ Storage 圖片 1,086 張

### Top 10 題庫
| App | 題數 |
|-----|------|
| nurseexam 護理師 | 11,910 |
| usmle2dev USMLE 2 | 10,217 |
| rtexam 醫事放射師 | 9,592 |
| mtexam 醫事檢驗師 | 9,574 |
| ptexam 物理治療師 | 9,107 |
| otexam 職能治療師 | 7,198 |
| vetexam 獸醫師 | 7,195 |
| rspexam 呼吸治療師 | 7,191 |
| mdexam2 醫師第二階段 | 6,392 |
| tcmexam2 中醫師第二階段 | 6,390 |

---

## 🛠 技術架構

- **前端**：Next.js 16 + React 19 + TypeScript + Tailwind
- **後端**：Supabase（PostgreSQL + Storage + Auth）
- **部署**：Vercel
- **AI**：Anthropic Claude Sonnet 4.5（詳解生成 + PDF 解析分類）
- **加密**：AES-256-GCM（詳解加密儲存）

---

## ✨ 主要功能

| 功能 | 說明 |
|------|------|
| 📋 題目管理 | CRUD、批次編輯、圖片上傳、Flag 標記 |
| 🤖 AI 詳解生成 | 單題 / 整類別 / **整個 App** 三種批次模式 |
| 📥 Import / Export | JSON / CSV 匯入匯出 |
| 💬 Feedback | iOS app 使用者回饋管理 |
| 👥 User 管理 | super_admin / admin / editor 三層權限 |
| 📈 Usage Monitor | DB 用量、API 請求、Free vs Pro 方案對照 |
| 💾 Backup | 一鍵 JSON 備份 + 本機 pg_dump 完整備份 |

---

## 💾 備份策略（3 層）

1. **Supabase 自動 7 天備份**（Pro 內建）
2. **每週日 02:00 launchd 自動備份**（pg_dump + Storage 圖片 → iCloud Drive）
3. **網站一鍵 JSON 備份**（即時資料快照）

詳見 [BACKUP_SETUP.md](./BACKUP_SETUP.md)

---

## 📅 重要里程碑

### 2026-05-11 — 題庫缺漏全面修復（+13,392 題）

完成 11 個 app 的歷史考古題缺漏補完，並修正 4,320 筆因 exam code 用錯而誤標籤的資料。

**新增題數明細：**
| App | 補入 |
|-----|------|
| dentexam1 牙醫一 | +320 |
| dentexam2 牙醫二 | +640 |
| mtexam 醫事檢驗 | +959 |
| rtexam 醫事放射 | +953 |
| ptexam 物理治療 | +960 |
| mdexam1 醫師一 | +160 |
| ntexam 營養師 | +280 |
| **mdexam2 醫師二** | **+2,880**（9 年第一次補完） |
| otexam 職能治療 | +1,920 |
| rspexam 呼吸治療 | +1,920 |
| **cpsexam 諮商心理** | **+2,400**（5 年雙次補完） |

**確認 vetexam 獸醫、mwexam 助產原本即無真實缺漏**（110-114 第一次依考選部排程未舉辦）。

### 2026-04-21 — 備份系統建置

建立完整三層備份保護（Supabase 內建 + 本機 pg_dump + 網站 JSON）。

### 2026-04-07 — Pro 方案升級

從 Supabase Free 升級到 Pro，解鎖 250 GB egress、8 GB DB、100 GB storage。

---

## 🔐 環境變數

`.env.local` 必要設定：
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_PASSWORD=        # for backup.sh
SUPABASE_ACCESS_TOKEN=       # for usage analytics
ANTHROPIC_API_KEY=
EXPLANATION_ENCRYPTION_KEY=  # 32-byte hex
```

---

## 📂 相關文件

- [BACKUP_SETUP.md](./BACKUP_SETUP.md) — 備份系統使用、災難還原指南
- [feedback_iOS.md](./feedback_iOS.md) — iOS app 整合 feedback 系統的說明

---

## 🚀 開發

```bash
npm install
npm run dev      # localhost:3000
npm run build    # production build
```

部署到 Vercel：
```bash
vercel --prod
```
