import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('admin_users')
    .select('*')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient()
  const body = await request.json()

  const { email, display_name, role, allowed_apps, allowed_categories } = body
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  // Create auth user with Supabase Admin API
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password: crypto.randomUUID(), // random initial password
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  // Insert into admin_users
  const { data, error } = await supabase
    .from('admin_users')
    .insert({
      id: authUser.user.id,
      email,
      display_name: display_name || null,
      role: role || 'editor',
      allowed_apps: allowed_apps || [],
      allowed_categories: allowed_categories || [],
    })
    .select()
    .single()

  if (error) {
    // Cleanup: delete the auth user if admin_users insert fails
    await supabase.auth.admin.deleteUser(authUser.user.id)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Generate password reset link so the user can set their own password
  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
  })

  return NextResponse.json({
    user: data,
    recovery_link: linkData?.properties?.action_link || null,
  }, { status: 201 })
}
