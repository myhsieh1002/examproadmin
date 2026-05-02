import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || ''
const PROJECT_REF = 'insaqafqbbunziratdxe'

// Plan limits (update if upgrading)
const PLAN_LIMITS: Record<string, { egress_gb: number; db_mb: number; storage_gb: number; mau: number; label: string; price: string }> = {
  free: { egress_gb: 5, db_mb: 500, storage_gb: 1, mau: 50000, label: 'Free', price: 'US$0/mo' },
  pro: { egress_gb: 250, db_mb: 8192, storage_gb: 100, mau: 100000, label: 'Pro', price: 'US$25/mo' },
}

// Average response size per request type (KB) — for egress estimation
const AVG_RESPONSE_KB = {
  rest: 2.5,    // typical REST API response ~2.5 KB
  auth: 1.0,    // auth tokens ~1 KB
  storage: 50,  // storage file downloads ~50 KB avg
  realtime: 0.5,
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

  // 3. API request counts from Supabase Management API (for egress estimation)
  // Note: Supabase public API only provides request counts, not actual egress bytes.
  // Egress estimation = request_count × avg_response_size
  // For accurate egress, check Supabase Dashboard manually.
  let apiCounts: { interval: string; totalRequests: number; estimatedEgressMB: number; breakdown: Record<string, number> } | null = null
  if (SUPABASE_ACCESS_TOKEN) {
    try {
      // Fetch 7-day window of API counts
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/usage.api-counts?interval=7day`,
        { headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}` } }
      )
      if (res.ok) {
        const data = await res.json()
        const rows = data.result || []
        let totalRest = 0, totalAuth = 0, totalStorage = 0, totalRealtime = 0
        for (const row of rows) {
          totalRest += row.total_rest_requests || 0
          totalAuth += row.total_auth_requests || 0
          totalStorage += row.total_storage_requests || 0
          totalRealtime += row.total_realtime_requests || 0
        }
        const totalRequests = totalRest + totalAuth + totalStorage + totalRealtime
        const estimatedEgressKB =
          totalRest * AVG_RESPONSE_KB.rest +
          totalAuth * AVG_RESPONSE_KB.auth +
          totalStorage * AVG_RESPONSE_KB.storage +
          totalRealtime * AVG_RESPONSE_KB.realtime
        apiCounts = {
          interval: '7day',
          totalRequests,
          estimatedEgressMB: Math.round(estimatedEgressKB / 1024 * 100) / 100,
          breakdown: { rest: totalRest, auth: totalAuth, storage: totalStorage, realtime: totalRealtime },
        }
      }
    } catch { /* ignore */ }
  }

  // 4. Apps info
  const { data: apps } = await supabase.from('apps').select('id, display_name, total_questions').order('id')

  // 5. Billing cycle (Supabase bills on account creation anniversary)
  const now = new Date()
  const cycleDay = 13
  const cycleStart = new Date(now.getFullYear(), now.getMonth(), cycleDay)
  if (cycleStart > now) cycleStart.setMonth(cycleStart.getMonth() - 1)
  const cycleEnd = new Date(cycleStart)
  cycleEnd.setMonth(cycleEnd.getMonth() + 1)

  const plan = 'pro' // Upgraded 2026-04-07
  const limits = PLAN_LIMITS[plan]

  return NextResponse.json({
    plan: limits.label,
    limits,
    all_plans: PLAN_LIMITS,
    current_plan_key: plan,
    billing_cycle: {
      start: cycleStart.toISOString().slice(0, 10),
      end: cycleEnd.toISOString().slice(0, 10),
    },
    database: {
      size_bytes: dbUsage?.database_size_bytes || null,
      tables: dbUsage?.tables || null,
    },
    api_counts: apiCounts,
    questions: {
      total: totalQuestions,
      with_explanation: withExplanation,
      without_explanation: withoutExplanation,
      per_app: appStats,
    },
    apps: apps || [],
  })
}
