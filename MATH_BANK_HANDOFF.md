# 高中數學題庫開發 — 交班文件（跨電腦）

> 給「另一台電腦」的 Claude Code 接續開發高中數學題庫用。
> 數學題庫接入**現有** examproadmin 系統與同一個 Supabase 資料庫。
> 本文件重點：**跨機器連線方法** + **數學公式處理設計**（與一般題庫最大不同）。

---

## 一、系統概觀

- **管理後台**（已部署，公開）：https://examproadmin.vercel.app
- **資料庫**：Supabase PostgreSQL（Pro 方案），Project ref `insaqafqbbunziratdxe`
- **架構**：所有題庫共用同一套 `apps` / `questions` / `categories` 表，用 `app_id` 隔離
- 高中數學只是「再多幾個 app + 多幾列資料」，與國考題庫零衝突

---

## 二、跨電腦連線方法（這台新電腦要怎麼接上）⭐

這台電腦**不需要 clone 整個 examproadmin 專案**，也不需要本地跑網站。
題目處理（下載 PDF → 解析 → 匯入）全部用 **Python script + 呼叫已部署的公開 API** 即可。

### 需要準備的 3 樣東西

| 項目 | 用途 | 怎麼取得 |
|------|------|---------|
| **Supabase URL** | 直接讀寫 DB（建 app、建類別、查 max ID） | `https://insaqafqbbunziratdxe.supabase.co`（固定） |
| **SUPABASE_SERVICE_ROLE_KEY** | DB 認證 | 從主力電腦的 `examproadmin/.env.local` 複製過來，**勿外流/勿 commit** |
| **ANTHROPIC_API_KEY** | Claude 解析 PDF（公式分類） | 自己的 key 或從 .env.local 複製 |

> 把這 3 個值設成環境變數或寫在本地 script 最上方即可。
> **加密金鑰（EXPLANATION_ENCRYPTION_KEY）不需要** — 詳解一律先留空，
> 之後用網站 AI 批次生成（加密在伺服器端做）。

### 連線方式分兩種

**A. 公開 API（免認證，匯入/重算/同步用）**
```
POST https://examproadmin.vercel.app/api/import            { app_id, questions[] }
POST https://examproadmin.vercel.app/api/categories/recount { app_id }
POST https://examproadmin.vercel.app/api/sync               { app_id }
```
這些端點不檢查 auth，任何機器都能呼叫（用來匯入題目）。

**B. Supabase REST（需 SERVICE_ROLE_KEY，建 app/類別、查 ID 用）**
```
GET/POST/PATCH  https://insaqafqbbunziratdxe.supabase.co/rest/v1/{table}
  headers: apikey + Authorization: Bearer {SERVICE_ROLE_KEY}
```

### 連線自我測試（新電腦第一步先跑這個確認通）
```python
import urllib.request, json
URL='https://insaqafqbbunziratdxe.supabase.co'
KEY='<貼上 SERVICE_ROLE_KEY>'
req = urllib.request.Request(f'{URL}/rest/v1/apps?select=id&limit=3',
    headers={'apikey':KEY,'Authorization':f'Bearer {KEY}'})
print(json.loads(urllib.request.urlopen(req, timeout=30).read()))
# 印得出 app id 清單 → 連線成功
```

---

## 三、資料庫結構（共用，數學相關慣例）

**apps**：`id`(PK) / `display_name` / `total_questions`(自動) / `version` / `min_app_version` / `last_updated`

**questions**（重點欄位）：
```
id                  text  PK，例 'GSATMA-2022-0001'
app_id              text  FK
question            text  題幹（數學：見第四節公式處理）
options             jsonb 選項陣列
answer              int   單選 0-indexed (0=A)
correct_answers     int[] 多選用
is_multiple_choice  bool
explanation_encrypted text  先留空
category            text  例 '多項式'、'三角函數'、'機率統計'
difficulty          int   預設 2
tags                jsonb ['111學年','數學A']
image_name          text  圖片題/公式圖用
source              text  '111學年度學測數學A'
group_id/group_order      題組用
is_published        bool  預設 true
```

**categories**（`UNIQUE(app_id,name)`，`id` 自動產生）：
⚠️ **新 app 必須先手動 insert categories**，recount 只更新不建立（見第六節）。

### App / ID 命名建議
| App | id | 題目 ID 前綴 |
|-----|-----|------------|
| 學測數學A | `gsat_matha` | `GSATMA-` |
| 學測數學B | `gsat_mathb` | `GSATMB-` |
| 分科測驗數甲 | `ast_matha` | `ASTMA-` |

> ID 格式 `{前綴}-{西元年}-{4位流水號}`

---

## 四、數學題庫設計核心：公式怎麼存？⭐⭐⭐

**這是數學題庫與其他科最大的不同，也是開工前必須先定案的決策。**

### 現況：iOS 題目模型只支援「純文字 + 圖片」
經查 iOS app 的 `Question.swift`：欄位只有 `text`（純文字）、`options`（純文字陣列）、
`imageName`（圖片）。**沒有 LaTeX / MathJax / 公式渲染**。

→ 數學的分數、根號、次方、矩陣、積分等若直接塞進 text，iOS 會顯示成亂碼或排版崩壞。

### 三種策略（必須擇一或混用，先決定再動工）

| 策略 | 做法 | 優點 | 缺點 |
|------|------|------|------|
| **A. 圖片題** | 含公式的題目/選項整段截圖存 Storage，`image_name` 指向它 | 不用改 iOS、最快上線 | 不能搜尋/複製、佔空間、選項也得圖片化較麻煩 |
| **B. LaTeX + 新 iOS 渲染** | 公式存 LaTeX 字串（如 `$\frac{1}{2}$`），iOS 新 app 用 KaTeX/MathJax（WKWebView）或 SwiftMath 渲染 | 可搜尋、體積小、最專業 | 要**改 / 新建 iOS app** 支援渲染 |
| **C. 混合** | 簡單式子用 Unicode（²、√、π、×、÷、≤），複雜的存圖片 | 折衷 | 一致性差、仍需 iOS 局部支援 |

### 建議
1. **先跟使用者確認 iOS 端策略**（要不要為數學做 LaTeX 渲染的新 app）
2. 若走 **A（圖片）**：解析流程要把每題（含選項）轉成圖片上傳 Storage `question-images/{app_id}/`
3. 若走 **B（LaTeX）**：用 Claude vision 讀 PDF，要求輸出 LaTeX；DB 存 LaTeX 字串
   - 這條路最值得，但要先確定 iOS app 會渲染，否則後台看得到、手機看不了
4. **在定案前，先只做「純文字比例高」的題目試水溫**（如純文字應用題），公式重的題目先擱置

### 題型處理
- **單選題**：`answer` = 0-3（或更多）index，`is_multiple_choice=false`
- **多選題**：`is_multiple_choice=true` + `correct_answers` 陣列
- **選填題 / 非選題（數學特有，答案是數值或式子）**：
  - 沒有 ABCDE 選項，現有 answer/options 機制不適用
  - 建議：**先跳過非選題**，只收選擇題（學測數學選擇題佔比夠做）
  - 或另設計欄位/呈現方式（需與 iOS 端討論）

---

## 五、開發流程

```
1. CEEC 下載 PDF（試題 + 答案）：https://www.ceec.edu.tw
2. pdftotext -layout 轉文字（公式會壞 → 見第四節決定策略）
3. 解析題目 + 答案（公式重的用 Claude vision；純文字用 regex/Claude）
4. 組 QuestionJSON（camelCase）
5. 本地驗證（題數、ID 唯一、答案對應、公式呈現正確）
6. POST /api/import
7. POST /api/categories/recount
8. POST /api/sync
```

### QuestionJSON 格式（camelCase）
```json
{
  "id": "GSATMA-2022-0001",
  "question": "若 f(x)=x²-3x+2，求 f(2) 之值？",
  "options": ["0", "1", "2", "3"],
  "answer": 0,
  "correctAnswers": null,
  "isMultipleChoice": false,
  "explanation": "",
  "category": "多項式函數",
  "tags": ["111學年", "數學A"],
  "source": "111學年度學測數學A",
  "version": "1.0",
  "image": null
}
```
> 公式策略走圖片時，`image` 填圖檔名、`question` 放題號或精簡文字。

---

## 六、踩坑清單（務必看）

### 🔴 1. ID 衝突會覆蓋資料
- `/api/import` 用 `upsert(onConflict='id')`，同 ID 直接覆蓋
- 匯入前**務必查既有最大 ID**，新題從 max+1 開始
- 查 max ID 的函式**必須要求成功**，失敗不可 default 回 0（否則從 0001 覆蓋）

### 🔴 2. 新 app 必須先手動建 categories
- `/api/categories/recount` 只**更新**既有類別、**不建立** → 不先建會回 `updated:0`
- 先 insert categories（給 app_id/name/sort_order，id 自動產生）：
```python
cats = [
  {'app_id':'gsat_matha','name':'多項式函數','sort_order':1},
  {'app_id':'gsat_matha','name':'三角函數','sort_order':2},
  {'app_id':'gsat_matha','name':'指數與對數','sort_order':3},
  {'app_id':'gsat_matha','name':'數列與級數','sort_order':4},
  {'app_id':'gsat_matha','name':'機率統計','sort_order':5},
  {'app_id':'gsat_matha','name':'平面向量','sort_order':6},
  # ...依實際命題範圍調整
]
body = json.dumps(cats).encode()
req = urllib.request.Request(f'{URL}/rest/v1/categories', data=body, method='POST',
    headers={'apikey':KEY,'Authorization':f'Bearer {KEY}',
             'Content-Type':'application/json','Prefer':'return=minimal'})
urllib.request.urlopen(req).read()
```

### 🔴 3. Supabase 偶發 HTTP 500 / 1000 row 上限
- 查詢一定分頁（limit 1000）；所有呼叫包重試 + backoff（5-10 次）

### 🔴 4. 數學 PDF 特別難解析
- pdftotext 對公式幾乎無用 → 公式重的題目**用 Claude vision 讀 PDF 頁面圖**
- 答案卷全形字母（Ａ Ｂ）要轉半形；學測數學選擇題注意題型混合（單選+多選+選填）
- **選填/非選題先跳過**，避免硬塞進 ABCDE 機制

### 🔴 5. 長任務會中途死 + thinking 區塊 400 錯誤
- 大量 Claude 呼叫時 session 可能中斷（API 529、網路、或 `thinking blocks cannot be modified` 400）
- **每處理完一個單位就存檔（intermediate save）+ 支援 resume**
- 對話拖太長易出 thinking 400 → 階段性收尾（每做完一份卷/一年告一段落）

### 🟡 6. 詳解先留空
- 題目匯入後，用網站「AI Generate → Entire App」批次生成詳解（省事可控）

---

## 七、可重用 script 骨架

```python
import urllib.request, json, time
URL='https://insaqafqbbunziratdxe.supabase.co'
KEY='<SERVICE_ROLE_KEY>'

def api_retry(fn, n=8):
    for i in range(n):
        try: return fn()
        except Exception as e:
            print(f'retry {i+1}: {e}'); time.sleep(3+i*2)
    raise RuntimeError('failed')

def get_max_id(app_id, year_ad, prefix):
    def _q():
        u=f'{URL}/rest/v1/questions?app_id=eq.{app_id}&id=like.{prefix}-{year_ad}-*&select=id&order=id.desc&limit=1'
        r=urllib.request.Request(u, headers={'apikey':KEY,'Authorization':f'Bearer {KEY}'})
        d=json.loads(urllib.request.urlopen(r,timeout=30).read())
        return int(d[0]['id'].split('-')[-1]) if d else 0
    return api_retry(_q)

def import_q(app_id, questions):
    b=json.dumps({'app_id':app_id,'questions':questions}).encode()
    r=urllib.request.Request('https://examproadmin.vercel.app/api/import',
        data=b, method='POST', headers={'Content-Type':'application/json'})
    return json.loads(urllib.request.urlopen(r,timeout=600).read())

def recount_sync(app_id):
    for ep in ['categories/recount','sync']:
        r=urllib.request.Request(f'https://examproadmin.vercel.app/api/{ep}',
            data=json.dumps({'app_id':app_id}).encode(), method='POST',
            headers={'Content-Type':'application/json'})
        print(ep, urllib.request.urlopen(r,timeout=120).read().decode())

def create_app(app_id, name):
    b=json.dumps({'id':app_id,'display_name':name,'version':'1.0',
        'min_app_version':'1.0.0','total_questions':0}).encode()
    r=urllib.request.Request(f'{URL}/rest/v1/apps', data=b, method='POST',
        headers={'apikey':KEY,'Authorization':f'Bearer {KEY}',
                 'Content-Type':'application/json','Prefer':'return=minimal'})
    urllib.request.urlopen(r).read()
```

---

## 八、給這台電腦 Claude Code 的提示詞（直接複製）

```
我要在這台電腦開發「高中數學題庫」，接入現有的 examproadmin 系統
（Next.js + Supabase + Vercel），與其他題庫共用同一個 Supabase 資料庫。
我不需要在這台跑網站，只要用 Python script 呼叫已部署的公開 API + Supabase REST。

請先閱讀這份交班文件（我會放在這台電腦，或從 GitHub examproadmin repo 取得
MATH_BANK_HANDOFF.md）：
<貼上文件路徑>

連線資訊我會另外給你（Supabase URL 固定、SERVICE_ROLE_KEY 與 ANTHROPIC_API_KEY
我手動提供，請勿 commit 或外流）。

【最重要的待決策】數學公式怎麼呈現？現有 iOS 題目模型只支援純文字+圖片，
沒有 LaTeX 渲染。請先跟我討論要走「圖片題」還是「LaTeX + 新 iOS 渲染」策略，
定案前不要大量匯入。

請先做（先別動手匯入）：
1. 用文件第二節的「連線自我測試」確認能讀到 Supabase（印出 app 清單）
2. 確認 CEEC 學測數學 A/B 歷屆試題下載結構
3. 下載 111 學年度學測數學A 的 PDF，試解析前 5 題，
   讓我看公式在 pdftotext 下壞成什麼樣，一起決定公式策略
4. 跟我確認公式策略後，才規劃正式流程

把 1-3 做完給我看，我們討論公式策略後再繼續。
```

---

## 九、速查

- 查缺漏：掃 `questions.source` 依年度分組
- 查詳解進度：數 `explanation_encrypted` 是否為空
- 批次 AI 詳解：網站 AI Generate → Entire App
- 備份：主力電腦 `examproadmin/backup.sh`（週日 02:00 自動，含全部 app）
- 圖片：Storage bucket `question-images`，路徑 `{app_id}/{image_name}`
- 國考完整經驗另見：`examproadmin/GSAT_DEV_HANDOFF.md`

---

*文件建立：2026-05 ｜ 適用：高中數學題庫（跨電腦開發）｜ 共用 DB：insaqafqbbunziratdxe*
