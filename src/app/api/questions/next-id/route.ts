import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

const APP_PREFIX: Record<string, string> = {
  npexam: 'NP',
  nurseexam: 'NR',
  surgeonexam: 'SG',
  mdexam: 'MD',
}

export async function GET(request: NextRequest) {
  const supabase = createServerClient()
  const appId = new URL(request.url).searchParams.get('app_id')

  if (!appId || !APP_PREFIX[appId]) {
    return NextResponse.json({ error: 'Invalid app_id' }, { status: 400 })
  }

  const prefix = APP_PREFIX[appId]
  const year = new Date().getFullYear()
  const pattern = `${prefix}-${year}-%`

  // Find the latest ID for this year
  const { data } = await supabase
    .from('questions')
    .select('id')
    .like('id', pattern)
    .order('id', { ascending: false })
    .limit(1)

  let nextSeq = 1
  if (data && data.length > 0) {
    const lastId = data[0].id
    // Extract sequence number from format PREFIX-YYYY-NNNN
    const parts = lastId.split('-')
    const lastSeq = parseInt(parts[parts.length - 1])
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1
    }
  }

  const id = `${prefix}-${year}-${String(nextSeq).padStart(4, '0')}`
  return NextResponse.json({ id })
}
