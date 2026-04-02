import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase-server'
import { encrypt } from '@/lib/encryption'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const BATCH_SIZE = 3

const SYSTEM_PROMPT = `你是一位台灣醫護國家考試的專業講師，擁有豐富的臨床與教學經驗。請為考題撰寫詳解。

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

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { app_id, category, overwrite, action, job_id } = body

  const supabase = createServerClient()

  // Stop action: mark job as stopping
  if (action === 'stop' && job_id) {
    await supabase.from('ai_jobs').update({ status: 'stopped', finished_at: new Date().toISOString() }).eq('id', job_id)
    return NextResponse.json({ ok: true })
  }

  // Resume action: process next chunk for existing job
  if (action === 'resume' && job_id) {
    const { data: job } = await supabase.from('ai_jobs').select('*').eq('id', job_id).single()
    if (!job || job.status !== 'running') {
      return NextResponse.json({ error: 'Job not found or not running', status: job?.status }, { status: 400 })
    }

    // Fetch ALL questions (bypass Supabase default 1000 limit)
    const allQuestions: any[] = []
    let from = 0
    const pageSize = 1000
    while (true) {
      const { data: batch } = await supabase
        .from('questions')
        .select('id, question, options, answer, category, source, explanation_encrypted, tags')
        .eq('app_id', job.app_id)
        .eq('category', job.category)
        .order('id')
        .range(from, from + pageSize - 1)
      if (!batch || batch.length === 0) break
      allQuestions.push(...batch)
      if (batch.length < pageSize) break
      from += pageSize
    }
    if (!allQuestions) return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 })

    // Filter to unprocessed
    const processedIds = new Set((job.logs || []).map((l: { questionId: string }) => l.questionId))
    let toProcess = allQuestions.filter((q) => !processedIds.has(q.id))
    if (!job.overwrite) {
      toProcess = toProcess.filter((q) => !q.explanation_encrypted)
    }

    // Take next chunk
    const chunk = toProcess.slice(0, BATCH_SIZE)

    if (chunk.length === 0) {
      // All done
      await supabase.from('ai_jobs').update({
        status: 'done',
        current: job.total,
        finished_at: new Date().toISOString(),
      }).eq('id', job_id)
      return NextResponse.json({ status: 'done', current: job.total, total: job.total, results: [] })
    }

    // Process chunk
    const results: { questionId: string; status: 'success' | 'error'; error?: string; flagged?: boolean }[] = []

    for (const q of chunk) {
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

        // Detect answer dispute flag
        const flagged = explanation.includes('[答案疑慮]')

        // Update question: encrypted explanation + tag if flagged
        const updateData: Record<string, unknown> = { explanation_encrypted: encrypt(explanation) }
        if (flagged) {
          const currentTags: string[] = q.tags || []
          if (!currentTags.includes('answer_disputed')) {
            updateData.tags = [...currentTags, 'answer_disputed']
          }
        }
        await supabase.from('questions').update(updateData).eq('id', q.id)

        results.push({ questionId: q.id, status: 'success', flagged })
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error'
        results.push({ questionId: q.id, status: 'error', error: errMsg })
      }
    }

    // Update job progress
    const newLogs = [...(job.logs || []), ...results]
    const successCount = newLogs.filter((l: { status: string }) => l.status === 'success').length
    const errorCount = newLogs.filter((l: { status: string }) => l.status === 'error').length
    const newCurrent = job.current + chunk.length
    const remaining = toProcess.length - chunk.length
    const isDone = remaining === 0

    await supabase.from('ai_jobs').update({
      current: newCurrent,
      success_count: successCount,
      error_count: errorCount,
      logs: newLogs,
      status: isDone ? 'done' : 'running',
      finished_at: isDone ? new Date().toISOString() : null,
    }).eq('id', job_id)

    return NextResponse.json({
      status: isDone ? 'done' : 'running',
      current: newCurrent,
      total: job.total,
      results,
      remaining,
    })
  }

  // Start new job
  if (!app_id || !category) {
    return NextResponse.json({ error: 'Missing app_id or category' }, { status: 400 })
  }

  // Check for existing running job on same app + category
  const { data: existing } = await supabase
    .from('ai_jobs')
    .select('id, status, current, total')
    .eq('app_id', app_id)
    .eq('category', category)
    .in('status', ['running', 'stopping'])
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({
      error: `This category already has an active job (${existing[0].current}/${existing[0].total}). Check Active Jobs below.`,
      existing_job_id: existing[0].id,
    }, { status: 409 })
  }

  // Fetch ALL questions (bypass Supabase default 1000 limit)
  const questions: any[] = []
  let startFrom = 0
  const pSize = 1000
  let fetchError = null
  while (true) {
    const { data: batch, error: err } = await supabase
      .from('questions')
      .select('id, question, options, answer, category, source, explanation_encrypted')
      .eq('app_id', app_id)
      .eq('category', category)
      .order('id')
      .range(startFrom, startFrom + pSize - 1)
    if (err) { fetchError = err; break }
    if (!batch || batch.length === 0) break
    questions.push(...batch)
    if (batch.length < pSize) break
    startFrom += pSize
  }
  const error = fetchError

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const toProcess = overwrite
    ? questions
    : questions.filter((q) => !q.explanation_encrypted)

  if (toProcess.length === 0) {
    return NextResponse.json({ error: 'No questions to process', total: 0 }, { status: 200 })
  }

  // Create job record
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  await supabase.from('ai_jobs').insert({
    id: jobId,
    status: 'running',
    app_id,
    category,
    overwrite: !!overwrite,
    total: toProcess.length,
    current: 0,
    success_count: 0,
    error_count: 0,
    logs: [],
    started_at: new Date().toISOString(),
  })

  return NextResponse.json({
    job_id: jobId,
    total: toProcess.length,
    skipped: questions.length - toProcess.length,
  })
}
