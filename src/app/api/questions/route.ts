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

  // Utility: get categories for an app (with live question counts)
  if (action === 'categories') {
    const { data: cats, error } = await supabase
      .from('categories')
      .select('*')
      .eq('app_id', appId)
      .order('sort_order')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Get live counts from questions table
    const { data: counts } = await supabase
      .from('questions')
      .select('category')
      .eq('app_id', appId || '')

    const countMap: Record<string, number> = {}
    if (counts) {
      for (const q of counts) {
        countMap[q.category] = (countMap[q.category] || 0) + 1
      }
    }

    const result = (cats || []).map(cat => ({
      ...cat,
      question_count: countMap[cat.name] || 0,
    }))

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

  if (category) query = query.eq('category', category)
  if (difficulty) query = query.eq('difficulty', parseInt(difficulty))
  if (search) query = query.ilike('question', `%${search}%`)

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

  const { data, error } = await supabase.from('questions').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
