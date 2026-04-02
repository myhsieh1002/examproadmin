import { NextRequest, NextResponse } from 'next/server'
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

// In-memory job store (per serverless instance)
// For Vercel, we use Supabase as the persistent store
interface Job {
  id: string
  status: 'running' | 'stopping' | 'done' | 'stopped' | 'error'
  app_id: string
  category: string
  overwrite: boolean
  total: number
  current: number
  success_count: number
  error_count: number
  logs: { questionId: string; status: 'success' | 'error' | 'skipped'; error?: string }[]
  started_at: string
  finished_at?: string
}

// Use Supabase ai_jobs table for persistence
async function getJob(supabase: ReturnType<typeof createServerClient>, jobId: string): Promise<Job | null> {
  const { data } = await supabase.from('ai_jobs').select('*').eq('id', jobId).single()
  return data as Job | null
}

async function upsertJob(supabase: ReturnType<typeof createServerClient>, job: Job) {
  await supabase.from('ai_jobs').upsert({
    id: job.id,
    status: job.status,
    app_id: job.app_id,
    category: job.category,
    overwrite: job.overwrite,
    total: job.total,
    current: job.current,
    success_count: job.success_count,
    error_count: job.error_count,
    logs: job.logs,
    started_at: job.started_at,
    finished_at: job.finished_at || null,
  })
}

async function processJob(job: Job, questions: { id: string; question: string; options: string[]; answer: number; category: string; source: string }[]) {
  const supabase = createServerClient()

  for (let i = 0; i < questions.length; i++) {
    // Check if stop requested
    const latest = await getJob(supabase, job.id)
    if (latest?.status === 'stopping') {
      job.status = 'stopped'
      job.finished_at = new Date().toISOString()
      await upsertJob(supabase, job)
      return
    }

    const q = questions[i]
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

      const encrypted = encrypt(explanation)
      await supabase
        .from('questions')
        .update({ explanation_encrypted: encrypted })
        .eq('id', q.id)

      job.current = i + 1
      job.success_count++
      job.logs.push({ questionId: q.id, status: 'success' })
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      job.current = i + 1
      job.error_count++
      job.logs.push({ questionId: q.id, status: 'error', error: errMsg })
    }

    // Save progress every question
    await upsertJob(supabase, job)
  }

  job.status = 'done'
  job.finished_at = new Date().toISOString()
  await upsertJob(supabase, job)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { app_id, category, overwrite, action, job_id } = body

  const supabase = createServerClient()

  // Stop action
  if (action === 'stop' && job_id) {
    await supabase.from('ai_jobs').update({ status: 'stopping' }).eq('id', job_id)
    return NextResponse.json({ ok: true })
  }

  if (!app_id || !category) {
    return NextResponse.json({ error: 'Missing app_id or category' }, { status: 400 })
  }

  // Fetch questions
  const { data: questions, error } = await supabase
    .from('questions')
    .select('id, question, options, answer, category, source, explanation_encrypted')
    .eq('app_id', app_id)
    .eq('category', category)
    .order('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Filter: skip those with existing explanations unless overwrite
  const toProcess = overwrite
    ? questions
    : questions.filter((q) => !q.explanation_encrypted)

  if (toProcess.length === 0) {
    return NextResponse.json({ error: 'No questions to process', total: 0 }, { status: 200 })
  }

  // Create job
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const job: Job = {
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
  }

  await upsertJob(supabase, job)

  // Start processing in background (fire-and-forget)
  // The Promise is intentionally not awaited
  processJob(job, toProcess).catch(async (err) => {
    job.status = 'error'
    job.finished_at = new Date().toISOString()
    job.logs.push({ questionId: '-', status: 'error', error: err instanceof Error ? err.message : 'Unknown error' })
    await upsertJob(supabase, job)
  })

  return NextResponse.json({
    job_id: jobId,
    total: toProcess.length,
    skipped: questions.length - toProcess.length,
  })
}
