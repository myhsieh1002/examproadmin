import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('job_id')
  const listActive = request.nextUrl.searchParams.get('list')

  const supabase = createServerClient()

  // List all active/recent jobs
  if (listActive === 'active') {
    const { data, error } = await supabase
      .from('ai_jobs')
      .select('id, status, app_id, category, total, current, success_count, error_count, started_at, finished_at')
      .in('status', ['running', 'stopping'])
      .order('started_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  }

  // Single job detail
  if (!jobId) {
    return NextResponse.json({ error: 'Missing job_id' }, { status: 400 })
  }

  const { data, error } = await supabase.from('ai_jobs').select('*').eq('id', jobId).single()

  if (error || !data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}
