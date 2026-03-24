import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const body = await request.json()

  const updates: Record<string, unknown> = {}
  if (body.display_name !== undefined) updates.display_name = body.display_name
  if (body.role !== undefined) updates.role = body.role
  if (body.allowed_apps !== undefined) updates.allowed_apps = body.allowed_apps
  if (body.allowed_categories !== undefined) updates.allowed_categories = body.allowed_categories

  const { data, error } = await supabase
    .from('admin_users')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()

  // Delete from admin_users (cascades from auth.users FK)
  const { error } = await supabase.from('admin_users').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Disable the auth user
  await supabase.auth.admin.updateUserById(id, { ban_duration: '876000h' }) // ~100 years

  return NextResponse.json({ success: true })
}
