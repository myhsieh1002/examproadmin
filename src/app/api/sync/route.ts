import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const supabase = createServerClient()
  const { app_id } = await request.json()

  // Get question count
  const { count } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true })
    .eq('app_id', app_id)
    .eq('is_published', true)

  const version = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '.')

  const { data, error } = await supabase
    .from('sync_manifest')
    .upsert({
      app_id,
      version,
      total_questions: count || 0,
      last_updated: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
