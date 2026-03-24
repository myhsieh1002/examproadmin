import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const supabase = createServerClient()
  const { app_id } = await request.json()

  if (!app_id) {
    return NextResponse.json({ error: 'app_id is required' }, { status: 400 })
  }

  // Get all categories for this app
  const { data: cats, error: catError } = await supabase
    .from('categories')
    .select('id, name')
    .eq('app_id', app_id)

  if (catError) return NextResponse.json({ error: catError.message }, { status: 500 })

  // Get live counts from questions
  const { data: questions } = await supabase
    .from('questions')
    .select('category')
    .eq('app_id', app_id)
    .eq('is_published', true)

  const countMap: Record<string, number> = {}
  if (questions) {
    for (const q of questions) {
      countMap[q.category] = (countMap[q.category] || 0) + 1
    }
  }

  // Update each category's question_count
  let updated = 0
  for (const cat of (cats || [])) {
    const newCount = countMap[cat.name] || 0
    await supabase
      .from('categories')
      .update({ question_count: newCount })
      .eq('id', cat.id)
    updated++
  }

  return NextResponse.json({ success: true, updated })
}
