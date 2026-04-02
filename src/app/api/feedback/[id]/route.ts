import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// PUT - Admin update feedback (status, response)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const supabase = createServerClient()

  const update: Record<string, unknown> = {}

  if (body.status) update.status = body.status
  if (body.admin_response !== undefined) update.admin_response = body.admin_response
  if (body.admin_responder_id) {
    update.admin_responder_id = body.admin_responder_id
    update.responded_at = new Date().toISOString()
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('feedback')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
