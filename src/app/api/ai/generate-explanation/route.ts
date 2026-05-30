import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const GSAT_SUBJECT_LABELS: Record<string, string> = {
  gsat_social: '社會（歷史 / 地理 / 公民）',
  gsat_chinese: '國文（國語文綜合能力測驗）',
  gsat_english: '英文',
  gsat_science: '自然（物理 / 化學 / 生物 / 地球科學）',
  gsat_matha: '數學 A',
  gsat_mathb: '數學 B',
}

const KOKAO_PROMPT = `你是一位台灣醫護國家考試的專業講師，擁有豐富的臨床與教學經驗。請為考題撰寫詳解。

要求：
1. 先簡要說明正確答案為何正確（1-2句）
2. 逐一分析每個選項的對錯原因
3. 補充相關的臨床知識或考試重點
4. 使用繁體中文
5. 保持專業但易讀，適合考生複習
6. 不要使用 markdown 格式（不要 #、**、- 等），使用純文字

最後，請判斷提供的正確答案是否正確。如果你認為答案有誤或有爭議，請在詳解最末加上一行：
[答案疑慮] 理由簡述
如果答案正確，則不需要加這行。`

function systemPromptFor(appId?: string): string {
  if (appId && appId.startsWith('gsat_')) {
    const subject = GSAT_SUBJECT_LABELS[appId] || '高中學測'
    const englishHint = appId === 'gsat_english'
      ? '7. 英文題型可引用題目原文片段、提供關鍵詞中文翻譯。\n'
      : ''
    return `你是台灣高中學科能力測驗（學測）${subject}考科的專業教師，擁有豐富的命題與教學經驗。請為下列選擇題撰寫詳解。

要求：
1. 先簡要說明正確答案為何正確（1-2 句）
2. 逐一分析每個選項的對錯原因
3. 補充與該題相關的學測重點觀念或解題技巧
4. 使用繁體中文
5. 保持專業但易讀，適合高中生複習
6. 不要使用 markdown 格式（不要 #、**、- 等），使用純文字
${englishHint}
最後，請判斷提供的正確答案是否正確。如果你認為答案有誤或有爭議，請在詳解最末加上一行：
[答案疑慮] 理由簡述
如果答案正確，則不需要加這行。`
  }
  return KOKAO_PROMPT
}

export async function POST(request: NextRequest) {
  try {
    const { question, options, answer, category, source, app_id } = await request.json()

    if (!question || !options || answer === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const answerLetter = String.fromCharCode(65 + answer)
    const optionsText = options
      .map((opt: string, i: number) => `${String.fromCharCode(65 + i)}. ${opt}`)
      .join('\n')

    const userPrompt = `題目：${question}
${optionsText}
正確答案：${answerLetter}
${category ? `科目：${category}` : ''}
${source ? `來源：${source}` : ''}`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPromptFor(app_id),
      messages: [{ role: 'user', content: userPrompt }],
    })

    const explanation = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')

    const flagged = explanation.includes('[答案疑慮]')

    return NextResponse.json({ explanation, flagged })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
