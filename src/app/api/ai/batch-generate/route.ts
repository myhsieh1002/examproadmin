import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase-server'
import { encrypt } from '@/lib/encryption'

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
  const { app_id, category, overwrite } = await request.json()

  if (!app_id || !category) {
    return new Response(JSON.stringify({ error: 'Missing app_id or category' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createServerClient()

  // Fetch questions for this category
  let query = supabase
    .from('questions')
    .select('id, question, options, answer, category, source, explanation_encrypted')
    .eq('app_id', app_id)
    .eq('category', category)
    .order('id')

  const { data: questions, error } = await query

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Filter to only those without explanations (unless overwrite)
  const toProcess = overwrite
    ? questions
    : questions.filter((q) => !q.explanation_encrypted)

  // SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      send({ type: 'start', total: toProcess.length })

      for (let i = 0; i < toProcess.length; i++) {
        const q = toProcess[i]
        try {
          const answerLetter = String.fromCharCode(65 + q.answer)
          const optionsText = q.options
            .map((opt: string, idx: number) => `${String.fromCharCode(65 + idx)}. ${opt}`)
            .join('\n')

          const userPrompt = `題目：${q.question}
${optionsText}
正確答案：${answerLetter}
${q.category ? `科目：${q.category}` : ''}
${q.source ? `來源：${q.source}` : ''}`

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

          // Encrypt and save to DB
          const encrypted = encrypt(explanation)
          await supabase
            .from('questions')
            .update({ explanation_encrypted: encrypted })
            .eq('id', q.id)

          send({
            type: 'progress',
            current: i + 1,
            total: toProcess.length,
            questionId: q.id,
            status: 'success',
          })
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error'
          send({
            type: 'progress',
            current: i + 1,
            total: toProcess.length,
            questionId: q.id,
            status: 'error',
            error: errMsg,
          })
        }
      }

      send({ type: 'done' })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
