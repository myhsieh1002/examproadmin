import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || ''
const PROJECT_REF = 'insaqafqbbunziratdxe'

// Plan limits (update if upgrading)
const PLAN_LIMITS: Record<string, { egress_gb: number; db_mb: number; storage_gb: number; mau: number; label: string }> = {
  free: { egress_gb: 5, db_mb: 500, storage_gb: 1, mau: 50000, label: 'Free' },
  pro: { egress_gb: 250, db_mb: 8192, storage_gb: 100, mau: 100000, label: 'Pro' },
}

export async function GET() {
  const supabase = createServerClient()

  // 1. DB usage via RPC function
  let dbUsage = null
  try {
    const { data } = await supabase.rpc('get_db_usage')
    dbUsage = data
  } catch { /* function may not exist yet */ }

  // 2. Question stats
  const allQuestions: { app_id: string; explanation_encrypted: string | null }[] = []
  let from = 0
  while (true) {
    const { data: batch } = await supabase
      .from('questions')
      .select('app_id, explanation_encrypted')
      .range(from, from + 999)
    if (!batch || batch.length === 0) break
    allQuestions.push(...batch)
    if (batch.length < 1000) break
    from += 1000
  }

  const totalQuestions = allQuestions.length
  const withExplanation = allQuestions.filter(q => !!q.explanation_encrypted).length
  const withoutExplanation = totalQuestions - withExplanation

  // Per-app stats
  const appStats: Record<string, { total: number; withExplanation: number }> = {}
  for (const q of allQuestions) {
    if (!appStats[q.app_id]) appStats[q.app_id] = { total: 0, withExplanation: 0 }
    appStats[q.app_id].total++
    if (q.explanation_encrypted) appStats[q.app_id].withExplanation++
  }

  // 3. Egress from Supabase Management API (if token available)
  let egress = null
  if (SUPABASE_ACCESS_TOKEN) {
    try {
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/usage.api-counts?interval=7day`,
        { headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}` } }
      )
      if (res.ok) {
        const data = await res.json()
        egress = data
      }
    } catch { /* ignore */ }
  }

  // 4. Apps info
  const { data: apps } = await supabase.from('apps').select('id, display_name, total_questions').order('id')

  // 5. Billing cycle (Supabase bills on account creation anniversary)
  // Project created 2026-03-24, so cycles on the 13th (org billing date from dashboard)
  const now = new Date()
  const cycleDay = 13
  const cycleStart = new Date(now.getFullYear(), now.getMonth(), cycleDay)
  if (cycleStart > now) cycleStart.setMonth(cycleStart.getMonth() - 1)
  const cycleEnd = new Date(cycleStart)
  cycleEnd.setMonth(cycleEnd.getMonth() + 1)

  const plan = 'free' // Change to 'pro' if upgraded
  const limits = PLAN_LIMITS[plan]

  return NextResponse.json({
    plan: limits.label,
    limits,
    billing_cycle: {
      start: cycleStart.toISOString().slice(0, 10),
      end: cycleEnd.toISOString().slice(0, 10),
    },
    database: {
      size_bytes: dbUsage?.database_size_bytes || null,
      tables: dbUsage?.tables || null,
    },
    questions: {
      total: totalQuestions,
      with_explanation: withExplanation,
      without_explanation: withoutExplanation,
      per_app: appStats,
    },
    apps: apps || [],
  })
}
