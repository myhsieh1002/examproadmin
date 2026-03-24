import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const supabase = createServerClient()
  const body = await request.json()

  const { app_id, name, icon, sort_order } = body
  if (!app_id || !name) {
    return NextResponse.json({ error: 'app_id and name are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({ app_id, name, icon: icon || null, sort_order: sort_order ?? 0 })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `Category "${name}" already exists for this app` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
