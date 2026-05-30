import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase-server'
import { decrypt } from '@/lib/encryption'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const GRADER_SYSTEM = `你是台灣大考中心 (CEEC) 學測非選擇題的閱卷委員。請嚴格依照題目提供的「評分原則」評閱學生作答，並按等級給分。
- 等級 2 = 完全給分（滿分）；等級 1 = 部分給分；等級 0 = 不給分
- 引用具體的評分原則條目（例如「等級 1: 1-1」「等級 2: AB 兩項皆正確」）
- feedback 用繁體中文、口吻具體鼓勵，限 80 字內
- 只輸出 JSON，不要任何前後文字、不要 markdown code fence`

export async function POST(request: NextRequest) {
  try {
    const { question_id, user_answer } = await request.json()
    if (!question_id) {
      return NextResponse.json({ error: 'question_id is required' }, { status: 400 })
    }

    const supabase = createServerClient()
    const { data: q, error } = await supabase
      .from('questions')
      .select('id, app_id, question, category, options, explanation_encrypted, tags, source')
      .eq('id', question_id)
      .single()
    if (error || !q) {
      return NextResponse.json({ error: 'question not found' }, { status: 404 })
    }

    // Verify this is a non-choice question (empty options array)
    if (Array.isArray(q.options) && q.options.length > 0) {
      return NextResponse.json(
        { error: 'not a non-choice question (options is non-empty)' },
        { status: 400 },
      )
    }

    const fullRubric = decrypt(q.explanation_encrypted || '')
    if (!fullRubric) {
      return NextResponse.json(
        { error: 'no model answer / grading rules stored for this question' },
        { status: 422 },
      )
    }

    // Split into model_answer + grading_rules on the 【評分原則】 marker we used at import time
    const marker = '【評分原則】'
    const splitIdx = fullRubric.indexOf(marker)
    const modelAnswer = (splitIdx >= 0 ? fullRubric.slice(0, splitIdx) : fullRubric).trim()
    const gradingRules =
      splitIdx >= 0 ? fullRubric.slice(splitIdx + marker.length).trim() : ''

    // Get exam display name for prompt context
    const { data: app } = await supabase
      .from('apps')
      .select('display_name')
      .eq('id', q.app_id)
      .single()
    const examName = app?.display_name || '學測'

    const userPrompt = `這是「${examName}」第 ${q.id.split('-').pop()} 題的評分任務（${q.category} 科${q.source ? '；' + q.source : ''}）。

【題目】
${q.question}

【滿分參考答案】
${modelAnswer}

【評分原則】
${gradingRules || '（評分原則未分離儲存；上述全文視為評分依據）'}

【學生作答】
${(user_answer || '').toString().trim() || '（空白）'}

請輸出嚴格 JSON：
{
  "level": 2 | 1 | 0,
  "score": <整數，滿分通常為 3 分，依該題實際配分換算>,
  "got_right": [<該生答對／符合的要點，每點一短句>],
  "got_wrong_or_missing": [<該生答錯／遺漏的要點，每點一短句>],
  "feedback": "<給學生的具體建議，80 字內，繁體中文>",
  "model_answer_hint": "<可揭示給學生的一條關鍵線索，30 字內，繁體中文>",
  "rubric_anchor": "<本判等級時引用的評分原則條目，如『等級 1: 1-1』>"
}`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: GRADER_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    })

    let txt = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    // tolerate model wrapping in code fences
    if (txt.startsWith('```')) {
      txt = txt.replace(/^```[a-z]*\n/, '').replace(/\n```\s*$/, '').trim()
    }

    let grading: Record<string, unknown>
    try {
      grading = JSON.parse(txt)
    } catch {
      return NextResponse.json(
        { error: 'AI response not parseable as JSON', raw: txt },
        { status: 502 },
      )
    }

    return NextResponse.json({
      question_id,
      app_id: q.app_id,
      category: q.category,
      grading,
    })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
