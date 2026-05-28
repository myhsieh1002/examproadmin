# 學測題庫開發 — 交班文件

> 本文件整理自 ExamPro 國考題庫系列的開發經驗（已累積 34 個 app、15 萬題），
> 供新 session 開發「高中學測題庫系列」時參考。
> 高中題庫接入**同一個** examproadmin 系統與 Supabase 資料庫管理。

---

## 一、專案背景

- **現有系統**：examproadmin（Next.js 16 + Supabase + Vercel）
  - 網站：https://examproadmin.vercel.app
  - 專案路徑：`/Users/myhsieh/02 ExamPro Series/題庫開發/examproadmin`
  - GitHub：https://github.com/myhsieh1002/examproadmin
- **資料庫**：Supabase PostgreSQL（Pro 方案）
  - Project ref：`insaqafqbbunziratdxe`
  - 認證資訊在 `examproadmin/.env.local`
- **目標**：新增高中學測（GSAT）題庫，沿用同一套 app/questions/categories 結構

---

## 二、架構決策：學測與國考共用同一個資料庫 ✅

**決議：學測題庫放在與國考相同的 Supabase 資料庫，不另開新庫。**

### 理由
1. **零衝突**：系統本來就是多題庫設計，所有資料用 `app_id` 隔離
   - App ID 用 `gsat_` 前綴、題目 ID 用 `GSATxx-` 前綴，與國考完全不撞
   - categories 用 app_id 隔離（同名科目如「物理」在不同 app 是不同列）
   - Storage 圖片路徑 `{app_id}/{檔名}`、ai_jobs 用 app_id+category 隔離
   - iOS app 各查自己的 app_id，互不干擾
2. **容量充裕**：截至 2026-05，DB 僅用 416 MB / 8192 MB（5.1%）
   - 平均每題 ~2.8 KB；學測預估 3,000-8,000 題 ≈ +10~25 MB，加完仍 ~5.4%
3. **零額外開發**：import/recount/sync/AI 詳解/備份/Usage 監控全自動支援新 app
4. **省成本**：一個 Pro 方案（$25/月）全包

### 何時才需要分庫（目前都不符合）
- 學測變成獨立產品/獨立團隊管理
- 合併流量逼近 Pro 上限（250 GB egress / 8 GB DB）
- 需要嚴格故障隔離（DB 偶爾卡住要 restart 時，國考+學測會一起受影響——但
  restart 即恢復、資料無損，不值得為此多養一套基礎設施）

→ 未來若學測爆量需獨立，再用 `pg_dump` 抽出 `gsat_*` 資料遷移即可。

---

## 三、題目來源（下載）

### 主要來源：大學入學考試中心（CEEC）
- 官網：https://www.ceec.edu.tw
- 歷屆試題：學測、分科測驗（111 學年起；110 前為指考）
- 路徑：考試專區 → 學科能力測驗 → 試題與參考答案
- 檔案格式：PDF（試題卷 + 參考答案/選擇題答案）

### 學測科目（111 學年 / 108 課綱後）
| 科目 | 備註 |
|------|------|
| 國文（選擇題） | 另有「國語文寫作能力測驗」國寫 = 非選，**跳過** |
| 英文 | 含閱讀測驗題組 + 非選（作文跳過） |
| 數學 A | 111 學年起分 A/B |
| 數學 B | |
| 社會 | 歷史、地理、公民混合 |
| 自然 | 物理、化學、生物、地科混合 |

### 注意年度斷層
- **111 學年（2022）起**用 108 課綱新制（數學分 A/B）
- 110 學年以前是舊制（學測數學單一卷）
- 建議先做 **111 學年之後**的新制，資料較一致

### 備援來源（CEEC 缺檔時）
- 得勝者文教、翰林雲端學院、南一 etc.，但**答案以 CEEC 官方為準**

---

## 四、資料庫結構（接入現有系統）

### 3 張核心表

**apps**（題庫清單）
```
id              text  PK，例如 'gsat_social'
display_name    text  '學測社會'
total_questions int   由 sync 自動更新
version         text  '1.0'
min_app_version text  '1.0.0'
last_updated    timestamptz
```

**questions**（題目）
```
id                    text  PK，例如 'GSATSO-2022-0001'
app_id                text  FK → apps.id
question              text  題幹
options               jsonb 選項陣列 ["選項A","選項B",...]
answer                int   單選答案 0-indexed (0=A)
correct_answers       int[] 多選答案 [0,2,3]
is_multiple_choice    bool  是否多選
explanation_encrypted text  AES 加密詳解（匯入時自動加密）
category              text  科目細類，例如 '物理'
subcategory           text
difficulty            int   預設 2
tags                  jsonb ['111學年','物理']
image_name            text  圖片題用（對應 Storage）
source                text  '111學年度學測自然'
version               text  '1.0'
group_id              text  題組共用 ID
group_order           int   題組內順序
is_published          bool  預設 true
```

**categories**（科目細類，由 recount 自動計數）
```
id, app_id, name, icon, sort_order, question_count, created_at
```
⚠️ 國考的 categories 是「預先存在」才被 recount 更新計數。
新 app 第一次匯入前，**先驗證 recount 是否會自動建立缺少的類別**，
若不會則需手動 insert categories 列（每科一列）。

### App ID 命名建議
| App | id | 題目 ID 前綴 |
|-----|-----|------------|
| 學測國文 | `gsat_chinese` | `GSATCH-` |
| 學測英文 | `gsat_english` | `GSATEN-` |
| 學測數學A | `gsat_matha` | `GSATMA-` |
| 學測數學B | `gsat_mathb` | `GSATMB-` |
| 學測社會 | `gsat_social` | `GSATSO-` |
| 學測自然 | `gsat_science` | `GSATSC-` |

> ID 格式 `{前綴}-{西元年}-{4位流水號}`，例 `GSATSC-2022-0001`

---

## 五、開發流程（已驗證可行）

```
1. 從 CEEC 下載 PDF（試題 + 答案）
2. pdftotext -layout 轉純文字
3. 解析題目（regex 或 Claude AI）+ 答案
4. 組成 JSON（QuestionJSON 格式）
5. 本地驗證（題數、ID 唯一性、答案對應）
6. 透過 /api/import 匯入
7. /api/categories/recount 重算科目計數
8. /api/sync 更新 sync_manifest（iOS app 才看得到新題）
```

### 關鍵 API（POST，本地 script 直接呼叫）
```
POST https://examproadmin.vercel.app/api/import
  body: { app_id, questions: QuestionJSON[] }
  → 自動分批 100 筆 upsert，詳解自動加密

POST https://examproadmin.vercel.app/api/categories/recount   body: { app_id }
POST https://examproadmin.vercel.app/api/sync                 body: { app_id }
```

### QuestionJSON 格式（camelCase！與 DB 欄位不同）
```json
{
  "id": "GSATSC-2022-0001",
  "question": "題幹文字",
  "options": ["選項A", "選項B", "選項C", "選項D", "選項E"],
  "answer": 0,
  "correctAnswers": [0, 2],
  "isMultipleChoice": false,
  "explanation": "",
  "category": "物理",
  "subcategory": "",
  "difficulty": 2,
  "tags": ["111學年", "物理"],
  "source": "111學年度學測自然",
  "version": "1.0",
  "groupId": "GSATSC-2022-G01",
  "groupOrder": 1
}
```

---

## 六、PDF 解析技術

**A. Regex parser（單一科目、純文字題）** — 本地、零成本、快
- 題號 `1.` + 選項 `A.`/`B.`/... 清楚的試卷
- 答案卷：`題號 01 02 ...` / `答案 Ａ Ｃ ...`（全形字母要轉半形）

**B. Claude AI parser（複雜版面、需分類、多選題）**
- 學測「一卷多科」「題組」「多選」「版面複雜」用這個
- 模型 `claude-sonnet-4-5`，**每批 40 題**（避免 JSON 過長/timeout）
- prompt 要求回純 JSON、明列可選科目

### 答案解析共用函式（注意學測 5 選項含 E）
```python
def parse_answers(text):
    trans = str.maketrans('ＡＢＣＤＥ', 'ABCDE')
    text = text.translate(trans)
    answers = {}
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if line.strip().startswith('題號'):
            nums = re.findall(r'\d+', line)
            if i+1 < len(lines) and lines[i+1].strip().startswith('答案'):
                letters = re.findall(r'[ABCDE]', lines[i+1])
                if len(letters) == len(nums):
                    for n, a in zip(nums, letters): answers[int(n)] = a
    return answers
```

---

## 七、踩坑清單（最重要！血淚教訓）

### 🔴 1. 答案 ID 衝突 → 會覆蓋既有資料
- `/api/import` 用 `upsert(onConflict='id')`，**同 ID 會覆蓋**
- 匯入前**務必查既有最大 ID**，新題從 max+1 開始
- `get_max_id()` **必須要求成功**，不可失敗時 default 回 0（否則從 0001 覆蓋既有題）

### 🔴 2. Supabase 偶發 HTTP 500 / 1000 row 上限
- 查詢**一定分頁**（limit 1000），否則只拿前 1000 筆
- 所有 API 呼叫**包重試 + backoff**（5-10 次，sleep 遞增）

### 🔴 3. 場次/標籤格式要全系列統一
- 國考踩過：考選部 code `YYY020`(第一次) vs `YYY100`(第二次)，規則隨年份變
- swexam 曾用「第1次」阿拉伯數字 → 與其他 app「第一次」中文不一致導致漏掃
- 學測用「**111 學年度**」格式（年份用學年非西元），但 ID 用西元年方便排序

### 🔴 4. PDF 解析陷阱
- **全形字母**：答案卷常用Ａ Ｂ Ｃ，要 translate 半形
- **非選擇題/國寫/作文**：一律跳過，只取選擇題
- **圖片題**：純圖片題 pdftotext 抓不到文字（空題幹）→ 需 OCR 或人工，少量先跳過並記錄
- **數學公式**：pdftotext 抽出亂碼/缺漏 → 考慮存圖片題或用 Claude vision
- **多選題**：學測自然/社會有多選，設 `isMultipleChoice=true` + `correctAnswers`

### 🔴 5. 題組（共用閱讀材料）
- 國文/英文/社會/自然有大量題組：一段文章/圖表 + 多題
- 用 `groupId`（同組相同）+ `groupOrder`（組內順序）
- 開工前先確認 iOS app 怎麼呈現題組，再決定材料放哪

### 🔴 6. 長時間任務會中途死掉
- Claude 大量呼叫（幾百次）時 parser 可能中斷（529/網路/OS）
- **每處理完一單位就存檔**（intermediate save）+ 支援 **resume**
- 背景執行 + Monitor 追蹤

### 🔴 7. Claude API 限制
- HTTP 529 overloaded → 重試
- 大 JSON escaping 易錯 → 拆 40 題一批
- 超長題組（含長文章）→ 單題單獨處理

### 🟡 8. IO / 成本控管
- 匯入是寫入，4000 題以下沒問題；大量匯入避免與 AI 批次詳解同時跑
- 詳解**先留空**，匯入後用網站「AI Generate → Entire App」批次生成

---

## 八、學測特有挑戰與建議起手順序

| 挑戰 | 建議做法 |
|------|---------|
| 數學公式多 | 數學科用 Claude vision 或存圖片題；先做純文字比例高的科目 |
| 自然含圖表 | 圖表題存 image_name + 上傳 Storage；純文字題照常 |
| 題組 | groupId/groupOrder；先確認 iOS 呈現 |
| 多選題 | isMultipleChoice + correctAnswers |
| 國寫/作文 | 跳過 |
| 5 個選項 | parser 與答案表都要支援 E |

**建議順序（由易到難）**：
1. **社會**（純文字比例高）← 推薦先做
2. 國文（選擇題部分）
3. 英文（題組多但純文字）
4. 自然（圖表多）
5. 數學 A/B（公式最多，最後做或用圖片策略）

---

## 九、可重用的 script 骨架

```python
import urllib.request, json, time
URL='https://insaqafqbbunziratdxe.supabase.co'
KEY='<從 examproadmin/.env.local 的 SUPABASE_SERVICE_ROLE_KEY 取得>'

def api_retry(fn, attempts=8):
    for i in range(attempts):
        try: return fn()
        except Exception as e:
            print(f'  retry {i+1}: {e}'); time.sleep(3 + i*2)
    raise RuntimeError('failed after retries')

def get_max_id(app_id, year_ad, prefix):
    def _q():
        url = f'{URL}/rest/v1/questions?app_id=eq.{app_id}&id=like.{prefix}-{year_ad}-*&select=id&order=id.desc&limit=1'
        req = urllib.request.Request(url, headers={'apikey':KEY,'Authorization':f'Bearer {KEY}'})
        data = json.loads(urllib.request.urlopen(req, timeout=30).read())
        return int(data[0]['id'].split('-')[-1]) if data else 0
    return api_retry(_q)

def import_questions(app_id, questions):
    body = json.dumps({'app_id':app_id,'questions':questions}).encode()
    req = urllib.request.Request('https://examproadmin.vercel.app/api/import',
        data=body, method='POST', headers={'Content-Type':'application/json'})
    return json.loads(urllib.request.urlopen(req, timeout=600).read())

def recount_and_sync(app_id):
    for ep in ['categories/recount','sync']:
        req = urllib.request.Request(f'https://examproadmin.vercel.app/api/{ep}',
            data=json.dumps({'app_id':app_id}).encode(), method='POST',
            headers={'Content-Type':'application/json'})
        print(ep, urllib.request.urlopen(req, timeout=120).read().decode())
```

### 新增 app 記錄（第一次建立題庫前）
```python
body = json.dumps({'id':'gsat_social','display_name':'學測社會',
    'version':'1.0','min_app_version':'1.0.0','total_questions':0}).encode()
req = urllib.request.Request(f'{URL}/rest/v1/apps', data=body, method='POST',
    headers={'apikey':KEY,'Authorization':f'Bearer {KEY}','Content-Type':'application/json','Prefer':'return=minimal'})
urllib.request.urlopen(req).read()
```

---

## 十、給新 session 的提示詞（直接複製貼上）

```
我要開發「高中學測題庫系列」，接入現有的 examproadmin 系統
（Next.js + Supabase + Vercel），與國考題庫共用同一個資料庫。

請先閱讀這份交班文件：
/Users/myhsieh/02 ExamPro Series/題庫開發/examproadmin/GSAT_DEV_HANDOFF.md

裡面有完整的：架構決策（同庫）、題目來源（大考中心 CEEC）、資料庫結構、
開發流程、PDF 解析技術（regex vs Claude AI）、踩坑清單、學測特有挑戰、
可重用的匯入 script 骨架。

背景重點：
- 專案路徑：/Users/myhsieh/02 ExamPro Series/題庫開發/examproadmin
- Supabase 認證在 examproadmin/.env.local（SERVICE_ROLE_KEY、ANTHROPIC_API_KEY 等）
- 題目透過 POST /api/import 匯入，之後 recount + sync
- App 命名前綴 gsat_，ID 前綴如 GSATSO-{西元年}-{流水號}
- 詳解先留空，匯入後再用網站 AI 批次生成

我想先從【社會】科開始（純文字比例最高、最好處理）。
請先做以下事情（先別動手匯入）：
1. 確認 CEEC 網站目前的學測歷屆試題下載結構（哪幾年、哪些 PDF 連結）
2. 確認新 app 要怎麼在 apps / categories 表建立（特別注意交班文件
   第四節提到的「categories 是否需手動 insert」這個未驗證點）
3. 下載 111 學年度學測社會的 PDF（試題+答案）做一份試解析，
   讓我看格式與品質，確認可行後再全量處理

把 1-3 做完給我看，我確認後再繼續。
```

---

## 十一、本系統工具/慣例速查

- **查缺漏**：掃 questions.source 欄位，依「年度+場次」grouping
- **查詳解進度**：數 `explanation_encrypted` 是否為空
- **批次 AI 詳解**：網站 AI Generate → Entire App 模式（前端驅動，每 chunk 3 題）
- **備份**：`examproadmin/backup.sh`（pg_dump + Storage 圖片 → iCloud Drive），週日 02:00 自動
- **Usage 監控**：網站 /usage 頁（DB 用量、Free vs Pro 對照）
- **圖片**：Supabase Storage bucket `question-images`，路徑 `{app_id}/{image_name}`

---

*文件建立：2026-05 ｜ 來源：ExamPro 國考題庫開發經驗（34 app / 15 萬題 / DB 用量 5.1%）*
