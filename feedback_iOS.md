# iOS App 回饋功能整合指南

## 概述

Admin 後台已建置完整的回饋系統，iOS App 只需呼叫一個 API 即可提交回饋。本文件說明 API 規格、UI 建議、以及整合步驟。

---

## API 規格

### 提交回饋

```
POST https://examproadmin.vercel.app/api/feedback
Content-Type: application/json
```

**Request Body:**

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `app_id` | String | 是 | App 識別碼（`npexam`, `nurseexam`, `surgeonexam`, `mdexam1`, `mdexam2`） |
| `question_id` | String | 否 | 題目 ID（如 `NP-2024-0001`），從題目頁面回饋時帶入 |
| `device_id` | String | 是 | 裝置唯一識別碼 |
| `feedback_type` | String | 是 | 回饋類型，見下方列表 |
| `message` | String | 否 | 使用者輸入的補充說明文字 |

**feedback_type 可選值：**

| 值 | 顯示文字 |
|----|---------|
| `wrong_answer` | 答案有誤 |
| `wrong_question` | 題目有誤 |
| `wrong_explanation` | 詳解有誤 |
| `other` | 其他 |

**Response (201 Created):**

```json
{
  "id": "uuid-of-feedback",
  "created_at": "2026-04-02T12:00:00Z"
}
```

**Error Response (400/500):**

```json
{
  "error": "Missing required fields: app_id, device_id, feedback_type"
}
```

---

## Swift 範例程式碼

### Model

```swift
struct FeedbackRequest: Codable {
    let appId: String
    let questionId: String?
    let deviceId: String
    let feedbackType: String
    let message: String?

    enum CodingKeys: String, CodingKey {
        case appId = "app_id"
        case questionId = "question_id"
        case deviceId = "device_id"
        case feedbackType = "feedback_type"
        case message
    }
}

enum FeedbackType: String, CaseIterable {
    case wrongAnswer = "wrong_answer"
    case wrongQuestion = "wrong_question"
    case wrongExplanation = "wrong_explanation"
    case other = "other"

    var displayName: String {
        switch self {
        case .wrongAnswer: return "答案有誤"
        case .wrongQuestion: return "題目有誤"
        case .wrongExplanation: return "詳解有誤"
        case .other: return "其他"
        }
    }
}
```

### Service

```swift
class FeedbackService {
    static let endpoint = "https://examproadmin.vercel.app/api/feedback"

    static func submit(
        appId: String,
        questionId: String?,
        feedbackType: FeedbackType,
        message: String?
    ) async throws {
        let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString

        let body = FeedbackRequest(
            appId: appId,
            questionId: questionId,
            deviceId: deviceId,
            feedbackType: feedbackType.rawValue,
            message: message?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true ? nil : message
        )

        var request = URLRequest(url: URL(string: endpoint)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }
}
```

### 使用範例

```swift
// 在題目詳情頁，使用者按下回饋按鈕後
try await FeedbackService.submit(
    appId: "npexam",
    questionId: "NP-2024-0001",
    feedbackType: .wrongAnswer,
    message: "標準答案應該是 B，因為..."
)
```

---

## iOS UI 建議

### 觸發方式
在題目詳情頁（作答結果頁）放置一個回饋按鈕，例如右上角的旗幟 icon 或底部的「回報問題」按鈕。

### 回饋流程

```
使用者點擊回饋按鈕
    ↓
彈出 ActionSheet 或半頁 Sheet
    ↓
Step 1: 選擇回饋類型（四個按鈕）
    - 答案有誤
    - 題目有誤
    - 詳解有誤
    - 其他
    ↓
Step 2: 文字輸入（選填）
    - TextField placeholder: "請描述問題（選填）"
    - 送出按鈕
    ↓
Step 3: 送出成功提示
    - "感謝您的回饋！我們會盡快處理。"
    - 自動關閉
```

### SwiftUI 參考結構

```swift
struct FeedbackSheet: View {
    let appId: String
    let questionId: String
    @State private var selectedType: FeedbackType?
    @State private var message = ""
    @State private var isSubmitting = false
    @State private var showSuccess = false
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text("回報問題")
                    .font(.headline)

                // Step 1: 選擇類型
                ForEach(FeedbackType.allCases, id: \.self) { type in
                    Button {
                        selectedType = type
                    } label: {
                        HStack {
                            Text(type.displayName)
                            Spacer()
                            if selectedType == type {
                                Image(systemName: "checkmark.circle.fill")
                            }
                        }
                        .padding()
                        .background(selectedType == type ? Color.blue.opacity(0.1) : Color.gray.opacity(0.05))
                        .cornerRadius(10)
                    }
                    .buttonStyle(.plain)
                }

                // Step 2: 文字輸入
                TextField("請描述問題（選填）", text: $message, axis: .vertical)
                    .lineLimit(3...6)
                    .textFieldStyle(.roundedBorder)

                // 送出按鈕
                Button {
                    Task { await submit() }
                } label: {
                    Text(isSubmitting ? "送出中..." : "送出回饋")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(selectedType != nil ? Color.blue : Color.gray)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                }
                .disabled(selectedType == nil || isSubmitting)

                Spacer()
            }
            .padding()
            .alert("感謝您的回饋！", isPresented: $showSuccess) {
                Button("確定") { dismiss() }
            } message: {
                Text("我們會盡快處理您的回報。")
            }
        }
    }

    func submit() async {
        guard let type = selectedType else { return }
        isSubmitting = true
        do {
            try await FeedbackService.submit(
                appId: appId,
                questionId: questionId,
                feedbackType: type,
                message: message.isEmpty ? nil : message
            )
            showSuccess = true
        } catch {
            // Handle error
        }
        isSubmitting = false
    }
}
```

---

## Admin 後台功能（已完成）

管理員可在 `examproadmin.vercel.app/feedback` 進行以下操作：

- 依狀態篩選：Open / In Progress / Resolved / Rejected
- 依類型篩選：答案有誤 / 題目有誤 / 詳解有誤 / 其他
- 展開回饋卡片查看完整訊息與題目內容
- 點擊題目 ID 直接跳轉到題目編輯頁
- 更改處理狀態
- 撰寫管理員回覆
- 記錄回覆者與時間

---

## 注意事項

1. **device_id 取得**：使用 `UIDevice.current.identifierForVendor?.uuidString`，App 重裝後會改變，但足以識別短期內同一使用者的重複回饋。
2. **無需認證**：API 端點為公開，不需要 token 或 API key。
3. **防濫用**：目前無 rate limit，日後若有需要可在 API 加入同一 device_id 的頻率限制。
4. **question_id 可為空**：允許提交與特定題目無關的一般性回饋。
5. **網路錯誤處理**：送出失敗時建議提示使用者稍後再試，不需本地暫存重送。
