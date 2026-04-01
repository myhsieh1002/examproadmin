import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SYSTEM_PROMPT = `你是一位台灣醫護國家考試的專業講師，擁有豐富的臨床與教學經驗。請為考題撰寫詳解。

要求：
1. 先簡要說明正確答案為何正確（1-2句）
2. 逐一分析每個選項的對錯原因
3. 補充相關的臨床知識或考試重點
4. 使用繁體中文
5. 保持專業但易讀，適合考生複習
6. 不要使用 markdown 格式（不要 #、**、- 等），使用純文字`

export async function POST(request: NextRequest) {
  try {
    const { question, options, answer, category, source } = await request.json()

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
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const explanation = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')

    return NextResponse.json({ explanation })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
