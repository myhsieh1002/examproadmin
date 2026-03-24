import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const body = await request.json()

  // Fetch old category to check if name changed
  const { data: oldCat, error: fetchError } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !oldCat) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.icon !== undefined) updates.icon = body.icon
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order

  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `Category "${body.name}" already exists for this app` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If name changed, update all questions referencing the old name
  if (body.name && body.name !== oldCat.name) {
    await supabase
      .from('questions')
      .update({ category: body.name })
      .eq('app_id', oldCat.app_id)
      .eq('category', oldCat.name)
  }

  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()

  // Check if any questions reference this category
  const { data: cat } = await supabase
    .from('categories')
    .select('app_id, name')
    .eq('id', id)
    .single()

  if (!cat) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  const { count } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('app_id', cat.app_id)
    .eq('category', cat.name)

  const force = new URL(request.url).searchParams.get('force') === 'true'

  if (count && count > 0 && !force) {
    return NextResponse.json({
      error: `Category "${cat.name}" has ${count} question(s). Use force=true to delete anyway.`,
      question_count: count,
    }, { status: 400 })
  }

  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
