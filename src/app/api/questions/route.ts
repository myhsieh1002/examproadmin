import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { encrypt } from '@/lib/encryption'

export async function GET(request: NextRequest) {
  const supabase = createServerClient()
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')
  const appId = searchParams.get('app_id')

  // Utility: get all apps
  if (action === 'apps') {
    const { data, error } = await supabase.from('apps').select('*').order('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Utility: get prev/next question IDs
  if (action === 'neighbors') {
    const qid = searchParams.get('id')
    if (!qid || !appId) return NextResponse.json({ error: 'Missing id or app_id' }, { status: 400 })

    const [{ data: prevData }, { data: nextData }] = await Promise.all([
      supabase.from('questions').select('id').eq('app_id', appId).lt('id', qid).order('id', { ascending: false }).limit(1),
      supabase.from('questions').select('id').eq('app_id', appId).gt('id', qid).order('id', { ascending: true }).limit(1),
    ])

    return NextResponse.json({
      prev: prevData?.[0]?.id || null,
      next: nextData?.[0]?.id || null,
    })
  }

  // Utility: explanation stats per app and per category
  if (action === 'explanation-stats') {
    // Fetch ALL questions (bypass Supabase default 1000 limit)
    const allQ: { category: string; explanation_encrypted: string }[] = []
    let statsFrom = 0
    while (true) {
      const { data: batch } = await supabase
        .from('questions')
        .select('category, explanation_encrypted')
        .eq('app_id', appId || '')
        .range(statsFrom, statsFrom + 999)
      if (!batch || batch.length === 0) break
      allQ.push(...batch)
      if (batch.length < 1000) break
      statsFrom += 1000
    }

    const stats: Record<string, { total: number; withExplanation: number }> = {}
    let appTotal = 0, appWithExp = 0

    for (const q of allQ || []) {
      const cat = q.category || '_uncategorized'
      if (!stats[cat]) stats[cat] = { total: 0, withExplanation: 0 }
      stats[cat].total++
      appTotal++
      if (q.explanation_encrypted) {
        stats[cat].withExplanation++
        appWithExp++
      }
    }

    return NextResponse.json({ app: { total: appTotal, withExplanation: appWithExp }, categories: stats })
  }

  // Utility: get categories for an app (with live question counts)
  if (action === 'categories') {
    const { data: cats, error } = await supabase
      .from('categories')
      .select('*')
      .eq('app_id', appId)
      .order('sort_order')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Get live counts using RPC to avoid Supabase row limit (default 1000)
    const { data: counts } = await supabase
      .rpc('count_questions_by_category', { p_app_id: appId || '' })

    const countMap: Record<string, number> = {}
    if (counts) {
      for (const row of counts) {
        countMap[row.category] = row.count
      }
    }

    const knownNames = new Set((cats || []).map(c => c.name))
    const orphaned = Object.entries(countMap)
      .filter(([name]) => !knownNames.has(name))
      .map(([name, count], i) => ({
        id: `orphan-${name}`,
        app_id: appId,
        name,
        icon: null,
        sort_order: 9999 + i,
        question_count: count,
        created_at: null,
        _isOrphan: true,
      }))

    const result = [
      ...(cats || []).map(cat => ({
        ...cat,
        question_count: countMap[cat.name] || 0,
      })),
      ...orphaned,
    ]

    return NextResponse.json(result)
  }

  // List questions with pagination and filters
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const category = searchParams.get('category')
  const search = searchParams.get('search')
  const difficulty = searchParams.get('difficulty')
  const offset = (page - 1) * limit

  let query = supabase
    .from('questions')
    .select('*', { count: 'exact' })
    .eq('app_id', appId || 'npexam')
    .order('id')
    .range(offset, offset + limit - 1)

  const flagged = searchParams.get('flagged')

  if (category) query = query.eq('category', category)
  if (difficulty) query = query.eq('difficulty', parseInt(difficulty))
  if (search) query = query.ilike('question', `%${search}%`)
  if (flagged === 'true') query = query.contains('tags', ['answer_disputed'])

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ questions: data, total: count, page, limit })
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient()
  const body = await request.json()

  // Encrypt explanation if provided
  if (body.explanation) {
    body.explanation_encrypted = encrypt(body.explanation)
    delete body.explanation
  }

  // Track editor
  if (body.edited_by_user_id) {
    body.last_edited_by = body.edited_by_user_id
    body.last_edited_at = new Date().toISOString()
    delete body.edited_by_user_id
  }

  const { data, error } = await supabase.from('questions').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
