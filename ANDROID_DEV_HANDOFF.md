# ExamPro Android 版開發交班文件

> 給新 Claude Code session 開發 ExamPro 系列的 Android 版本用。
> 後端（Supabase）與 iOS 完全共用，不需新建後端。
> 本文涵蓋：完整 app 清單、現有 iOS 架構、後端 API、建議的 Android 架構策略。

---

## 一、專案總覽

- **產品線**：ExamPro 系列 — 台灣國家考試 + 高中學測題庫 app
- **目前 iOS 版**：24 個獨立 Xcode 專案（每個 app 一個 bundle id + 一個 StoreKit 訂閱）
- **後端**：Supabase PostgreSQL + Edge Function + Storage（Pro 方案）
  - URL：`https://insaqafqbbunziratdxe.supabase.co`
  - anon key 公開可寫入 iOS Constants（RLS 保護資料）
- **管理後台**：examproadmin（Vercel）— 管題庫/AI 詳解/使用量/備份，Android 端不會碰
- **題庫總量**（截至 2026-05-29）：**44 app / 152,316 題**

---

## 二、完整 App 清單（44 個 app_id）

| app_id | 顯示名稱 | 題數 | iOS 專案 |
|---|---|---:|---|
| **─── 醫師類 ───** |||
| mdexam1 | 醫師第一階段國考 | 3,864 | MedExam1Pro |
| mdexam2 | 醫師第二階段國考 | 6,392 | MedExam2Pro |
| dentexam1 | 牙醫師第一階段國考 | 3,186 | DentalExam 1 Pro |
| dentexam2 | 牙醫師第二階段國考 | 6,381 | DentalExam 2 Pro |
| tcmexam1 | 中醫師第一階段國考 | 3,195 | TCMExam1Pro |
| tcmexam2 | 中醫師第二階段國考 | 6,390 | TCMExam2Pro |
| pharmexam1 | 藥師第一階段國考 | 4,642 | PharmExam1Pro |
| pharmexam2 | 藥師第二階段國考 | 4,193 | PharmExam2Pro |
| vetexam | 獸醫師國考 | 7,195 | VetExamPro |
| surgeonexam | 外科專科醫師考試 | 2,295 | SurgeonExamPro |
| **─── 醫事技術師 ───** |||
| mtexam | 醫事檢驗師國考 | 9,574 | LabExamPro |
| rtexam | 醫事放射師國考 | 9,592 | RadExamPro |
| ptexam | 物理治療師國考 | 9,107 | PTExamPro |
| otexam | 職能治療師國考 | 7,198 | OTExamPro |
| rspexam | 呼吸治療師國考 | 7,191 | RespExamPro |
| slpexam | 語言治療師國考 | 3,012 | SLPExamPro |
| audexam | 聽力師國考 | 3,060 | AudExamPro |
| optexam | 驗光師國考 | 2,961 | （無 iOS） |
| dtexam | 牙體技術師國考 | 2,037 | （無 iOS） |
| **─── 護理 ───** |||
| nurseexam | 護理師國家考試 | 11,910 | NurseExamPro |
| npexam | 專科護理師甄審考試 | 3,845 | NPExamPro |
| anestnp | 麻醉專科護理師甄審 | 949 | （無 iOS） |
| mwexam | 助產師國考 | 3,409 | （無 iOS） |
| **─── 心理 / 社工 / 營養 / 公衛 ───** |||
| cpexam | 臨床心理師國考 | 1,201 | ClinPsyExamPro |
| cpsexam | 諮商心理師國考 | 3,361 | CounPsyExamPro |
| swexam | 社會工作師國考 | 4,973 | SWExamPro |
| ntexam | 營養師國考 | 1,107 | NutritionExamPro |
| phexam | 公共衛生師國考 | 1,196 | PHExamPro |
| **─── 駕照 / 導遊領隊 ───** |||
| carlic | 汽車駕照筆試 | 1,484 | （無 iOS） |
| motorlic | 機車駕照筆試 | 990 | （無 iOS） |
| tourguide | 導遊人員國考 | 1,349 | （無 iOS） |
| tourleader | 領隊人員國考 | 1,349 | （無 iOS） |
| **─── 高中學測 ───** |||
| gsat_chinese | 學測國文 | 182 | GsatExamPro（含多科） |
| gsat_english | 學測英文 | 249 | ↑ |
| gsat_matha | 學測數學 A | 80 | ↑ |
| gsat_social | 學測社會 | 326 | ↑ |
| gsat_science | 學測自然 | 288 | ↑ |
| gsat_*_generated | AI 生成練習題（各科） | 915 | ↑ |
| **─── 開發用（不上架） ───** |||
| usmle1dev / usmle2dev | USMLE 開發 | 11,688 | — |

> ⚠️ 「（無 iOS）」標記的 app_id 已有題庫但尚未推出 iOS 版 — Android 可以**搶先這幾個**先上架（碰不到 iOS 的競品壓力）。

---

## 三、後端架構（Android 也用這套，**不要重建**）

### Supabase 資料表（共用）
```
apps            id, display_name, total_questions, version, last_updated, min_app_version
questions       id, app_id, question, options(jsonb), answer, correct_answers(int[]),
                is_multiple_choice, explanation_encrypted, category, subcategory,
                difficulty, tags(jsonb), image_name, source, version, group_id,
                group_order, is_published, updated_at, created_at
categories      id, app_id, name, icon, sort_order, question_count, created_at
sync_manifest   app_id, version, total_questions, last_updated
admin_users     id, email, display_name, role, allowed_apps, allowed_categories
ai_jobs         id, app_id, category, status, ...
feedback        id, app_id, question_id, type, message, status, device_id, ...
```

### REST 端點（Android 直接打 Supabase REST API）
```
GET /rest/v1/sync_manifest?app_id=eq.{appId}
GET /rest/v1/questions?app_id=eq.{appId}&is_published=eq.true&order=id&limit=N&offset=M
GET /rest/v1/questions?app_id=eq.{appId}&is_published=eq.true&updated_at=gte.{iso}  # 增量
GET /rest/v1/questions?app_id=eq.{appId}&select=id&is_published=eq.true              # 刪除偵測
GET /rest/v1/categories?app_id=eq.{appId}&order=sort_order
```

Headers：
```
apikey: {anonKey}
Authorization: Bearer {anonKey}
```

### Edge Function（詳解解密 — 加密的詳解只有付費用戶能解）
```
POST {URL}/functions/v1/decrypt-explanation
  headers: Authorization: Bearer {anonKey}
  body: { questionId }
  → { explanation: "..." }
```

### Storage（圖片題）
```
GET {URL}/storage/v1/object/public/question-images/{app_id}/{image_name}
```

### Feedback（使用者回報）
```
POST /rest/v1/feedback   { app_id, question_id?, type, message, device_id, ... }
```

---

## 四、iOS 架構詳解（Android 參照這個設計）

每個 iOS 專案結構一致（看 OTExamPro 為例）：

```
{App}Pro/
├── App/                    # SwiftUI 入口
│   ├── ContentView.swift
│   └── {App}ProApp.swift   # @main, ModelContainer, environment objects
├── Utilities/
│   └── Constants.swift     # 🔑 supabaseAppId、URL、anonKey、StoreKit IDs
├── Models/
│   ├── Question.swift      # SwiftData @Model + SupabaseQuestion (Codable)
│   ├── AnswerRecord.swift
│   ├── ExamRecord.swift
│   ├── QuestionMastery.swift
│   └── UserProfile.swift
├── Services/               # 業務邏輯層（最關鍵）
│   ├── SupabaseService     # REST 同步 + Edge Function 呼叫
│   ├── QuestionBankService # 同步管理（增量、刪除偵測、進度回報）
│   ├── ExplanationService  # 詳解快取 + 按需解密
│   ├── EntitlementManager  # 付費門檻（detect StoreKit 結果）
│   ├── StoreKitService     # 訂閱購買 / 還原 / Transaction listener
│   ├── MasteryService      # 答題紀錄 → 熟悉度演算
│   └── NotificationService # 每日提醒
├── ViewModels/
├── Views/
│   ├── Home/               # 首頁 + 同步進度 + 連續打卡
│   ├── Exam/               # 完整模擬 / 快測 / 闖關 / 弱點補強 / 複習
│   ├── Analytics/          # 雷達圖 + 趨勢圖
│   ├── Paywall/            # 訂閱牆
│   └── Settings/           # 設定 + 引導
└── Resources/
    └── Assets.xcassets
```

### 核心同步流程
```
1. fetchSyncManifest(app_id)        → 取得後端 version + total
2. 比對本地 syncVersion (UserDefaults)
3. 不同 → fetchUpdatedQuestions(since: lastSync) 分頁拉取（500/頁）
4. fetchAllQuestionIDs()            → 與本地 ID 集合比對，刪除多餘
5. 更新本地 SwiftData + version
6. 詳解 explanation 欄位**留空** — 真正點開題目時才透過 ExplanationService.getExplanation(id)
   → 若已付費 → 呼叫 Edge Function 即時解密、加入快取
   → 若未付費 → 顯示鎖鏈圖示，導向 Paywall
```

### Constants.swift 範本（每 app 只差幾行）
```swift
enum Constants {
    static let supabaseURL    = "https://insaqafqbbunziratdxe.supabase.co"
    static let supabaseAnonKey = "eyJhbGciOiJI...（公開可放 client）"
    static let supabaseAppId  = "otexam"           // ← 各 app 唯一不同

    static let syncVersionKey = "supabaseSyncVersion"
    static let syncPageSize   = 500

    // StoreKit（各 app 一組）
    static let monthlyID   = "com.otexampro.app.premium.monthly"
    static let quarterlyID = "com.otexampro.app.premium.quarterly"

    // 考試 UI 參數
    static let fullExamQuestionCount = 80
    static let fullExamTimeLimit     = 90 * 60.0
    static let quickQuizQuestionCount = 10
    static let weaknessQuestionCount  = 15
}
```

---

## 五、Android 架構建議（重要：要不要做模組化）

### 現況：iOS 是「每 app 一個獨立 Xcode 專案」 → 大量複製貼上
24 個 iOS 專案的程式碼**95% 相同**，差別只在 Constants + Assets + Bundle ID + StoreKit IDs。
這在 iOS 是歷史包袱，**Android 別重蹈覆轍**。

### 推薦：**單一 Gradle 專案 + Product Flavors**
- 一份程式碼（`:app` module 或 `:examcore` library + `:app` thin shell）
- 每個 app_id 對應一個 **Product Flavor**：差異只在
  - `applicationId`（包名）
  - `versionCode/versionName`
  - `supabaseAppId`（透過 `buildConfigField` 注入）
  - 圖示/啟動畫面/字串資源（`src/{flavor}/res/`）
  - Google Play Billing 商品 ID
- 編譯時切 flavor 即可產出對應 APK/AAB
- **後端完全共用**，UI 元件、Service、ViewModel 全部一份

```gradle
android {
    productFlavors {
        otexam   { dimension "exam"; applicationId "com.otexampro.app";
                   buildConfigField "String", "APP_ID", "\"otexam\"" }
        ptexam   { dimension "exam"; applicationId "com.ptexampro.app";
                   buildConfigField "String", "APP_ID", "\"ptexam\"" }
        // ... 其他 22 個
    }
}
```

### 技術棧建議
| 層 | iOS | Android |
|---|---|---|
| UI | SwiftUI | **Jetpack Compose** |
| 本地資料 | SwiftData (CoreData) | **Room** |
| 網路 | URLSession | **Retrofit + OkHttp** 或 **Ktor Client** |
| DI | 手動 singleton | **Hilt** 或 **Koin** |
| 非同步 | async/await | **Kotlin Coroutines + Flow** |
| 訂閱 | StoreKit 2 | **Google Play Billing Library v6+** |
| 圖表 | Swift Charts | **MPAndroidChart** 或 **Vico** |
| 推播/通知 | UserNotifications | **AlarmManager + NotificationCompat** |
| 觀察狀態 | `@Observable` | **StateFlow / Compose State** |

### iOS Service → Android 對映
```
SupabaseService     → SupabaseClient (Retrofit interface)
QuestionBankService → SyncRepository + WorkManager（背景同步）
ExplanationService  → ExplanationRepository（內建 LruCache）
EntitlementManager  → BillingManager 監聽 Purchase 狀態
StoreKitService     → Play Billing wrapper
MasteryService      → MasteryRepository + Room
NotificationService → DailyReminderWorker (WorkManager)
```

---

## 六、需要分享的設定（從主力電腦複製過去）

### 公開可放 client（commit 進 repo 沒關係）
- Supabase URL：`https://insaqafqbbunziratdxe.supabase.co`
- Supabase anon key（從 iOS Constants.swift 抓，或主力電腦 `examproadmin/.env.local` 的 `NEXT_PUBLIC_SUPABASE_ANON_KEY`）

### 各 flavor 需要的（從 iOS 對應專案 Constants.swift 抓）
- 各 app 的 StoreKit 訂閱 ID（轉成 Play Billing 商品 ID 即可，命名可以重新規劃）
- 各 app 的圖示/品牌色

### **絕對不要**放進 Android client
- `SUPABASE_SERVICE_ROLE_KEY`（這把鑰匙能寫整個資料庫，只能放後台）
- `EXPLANATION_ENCRYPTION_KEY`（加密金鑰只在 Edge Function 用）

---

## 七、踩坑提醒（從 iOS 端與後台開發累積的經驗）

### 🔴 1. 同步要分頁
- Supabase REST 預設一次最多 1000 列，**寫死分頁**（每頁 500）
- iOS 用 limit/offset；可選 Range header 但比較雷

### 🔴 2. 詳解一定要按需解密、不能下載時一起拉
- 詳解是加密的，下載到本地也沒用
- 必須**點開題目時**呼叫 Edge Function 解，快取在記憶體
- 免費用戶**完全不呼叫**（避免浪費 Edge Function 額度）

### 🔴 3. 增量同步用 `updated_at`，不是 `created_at`
- 後台改題會更新 `updated_at` 但不變 `created_at`
- 用 `updated_at=gte.{lastSync}` 才能拉到改過的舊題

### 🔴 4. 刪除偵測：拉一份「目前所有 published ID」與本地比對
- 後台會把過時題目改 `is_published=false`，REST 查詢加 `is_published=eq.true` 就會自動過濾掉
- 但本地仍有那些 ID → 同步時要算差集刪除

### 🟡 5. Product Flavor 數量大會影響編譯時間
- 24+ flavor 編譯所有變體會很慢
- 開發時用 **`-Pflavor=otexam`** 或 IDE 切換，只編該 flavor
- CI 才一次跑全部

### 🟡 6. Play Billing 商品 ID 命名要一致
- 建議用 `com.{appid}.premium.monthly` / `com.{appid}.premium.quarterly`
- 每個 app 在 Play Console 上是**獨立的應用程式**，商品 ID 在自己的 app 範圍內

### 🟡 7. 圖片題的 image_name
- 不含資料夾路徑，**Android 端要組**：`{URL}/storage/v1/object/public/question-images/{appId}/{imageName}`
- 用 Coil / Glide 載入，加快取

### 🟡 8. RLS（資料庫權限）
- 後端有 RLS：anon key 只能讀 `is_published=true` 的題目
- 不能 INSERT/UPDATE/DELETE 題目（只有 service role 才能）
- 可以 INSERT 到 `feedback` 表（使用者回報用）

---

## 八、給新 session 的提示詞（直接複製）

```
我要開發 ExamPro 系列的 Android 版本，後端與 iOS 完全共用同一個
Supabase 資料庫（不需重建後端）。目前 iOS 有 24 個獨立 app，背後有
44 個 app_id / 15 萬題題庫。Android 我希望走「單一 Gradle 專案 +
Product Flavors」策略避免複製貼上。

請先閱讀這份交班文件：
/Users/myhsieh/02 ExamPro Series/題庫開發/examproadmin/ANDROID_DEV_HANDOFF.md

裡面有：完整 44 app 清單、iOS 既有架構、Supabase REST 端點、Edge
Function、Storage 路徑、iOS Service 與 Android 對映、推薦技術棧、
踩坑清單。

請先做（先別開工真正的功能）：
1. 確認你已讀懂這份文件，列出你打算用的 Android 技術棧（Compose、Room、
   Hilt/Koin、Retrofit/Ktor、Play Billing v6+ 等）讓我 review
2. 規劃 Gradle 模組結構：是 :app + Product Flavors 一份程式碼，
   還是 :core (library) + 每 app 一個 :app 模組？建議走哪個並說明
3. 用 OTExamPro（iOS）作為 reference，畫一個 Android 端對應的層級圖
   （UI 層 / ViewModel / Repository / Service / 資料源），並指出哪些
   可以從 Supabase REST 直接打、哪些需要本地快取（Room）
4. 用 Supabase REST 試打一個唯讀 endpoint 證明連線通：
   GET /rest/v1/sync_manifest?app_id=eq.otexam（用 anon key）
   把回傳貼給我看

把 1-4 做完給我看，我們對齊架構後再開始實作首個 flavor（建議 otexam
或 dtexam — dtexam 還沒有 iOS 版，Android 能搶先）。
```

---

## 九、相關文件

- 國考題庫開發經驗：`examproadmin/GSAT_DEV_HANDOFF.md`
- 數學題庫（跨電腦）開發：`examproadmin/MATH_BANK_HANDOFF.md`
- 備份系統：`examproadmin/BACKUP_SETUP.md`
- 一份 iOS Reference：`/Users/myhsieh/02 ExamPro Series/OTExamPro/`（最完整的 iOS 專案）

---

*文件建立：2026-05-29 ｜ 後端：insaqafqbbunziratdxe（Supabase Pro）｜ 共用 44 app / 152,316 題*
