import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

const VALID_TYPES = ['wrong_answer', 'wrong_question', 'wrong_explanation', 'other']

// POST - iOS App submit feedback (public, no auth)
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { app_id, question_id, device_id, feedback_type, message } = body

  if (!app_id || !device_id || !feedback_type) {
    return NextResponse.json({ error: 'Missing required fields: app_id, device_id, feedback_type' }, { status: 400 })
  }

  if (!VALID_TYPES.includes(feedback_type)) {
    return NextResponse.json({ error: `Invalid feedback_type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('feedback')
    .insert({
      app_id,
      question_id: question_id || null,
      device_id,
      feedback_type,
      message: message || null,
    })
    .select('id, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

// GET - Admin list feedback with filters
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const appId = searchParams.get('app_id')
  const status = searchParams.get('status')
  const feedbackType = searchParams.get('feedback_type')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '30')
  const offset = (page - 1) * limit

  const supabase = createServerClient()

  let query = supabase
    .from('feedback')
    .select('*, questions:question_id(id, question)', { count: 'exact' })

  if (appId) query = query.eq('app_id', appId)
  if (status) query = query.eq('status', status)
  if (feedbackType) query = query.eq('feedback_type', feedbackType)

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    feedback: data || [],
    total: count || 0,
    page,
    limit,
  })
}
