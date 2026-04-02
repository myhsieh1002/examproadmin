import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import crypto from 'crypto'

const BUCKET = 'question-images'
const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export async function POST(request: NextRequest) {
  const supabase = createServerClient()

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const appId = formData.get('app_id') as string | null

  if (!file || !appId) {
    return NextResponse.json({ error: 'Missing file or app_id' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only PNG, JPG, WEBP allowed' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex')
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`
  const storagePath = `${appId}/${fileName}`

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)

  // Save metadata
  const { error: dbError } = await supabase.from('question_images').insert({
    app_id: appId,
    file_name: fileName,
    storage_path: storagePath,
    checksum,
    size_bytes: file.size,
  })

  if (dbError) {
    // Cleanup storage if DB insert fails
    await supabase.storage.from(BUCKET).remove([storagePath])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({
    file_name: fileName,
    storage_path: storagePath,
    public_url: urlData.publicUrl,
    size_bytes: file.size,
  })
}

export async function GET(request: NextRequest) {
  const appId = request.nextUrl.searchParams.get('app_id')

  if (!appId) {
    return NextResponse.json({ error: 'Missing app_id' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('question_images')
    .select('*')
    .eq('app_id', appId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Add public URLs
  const images = (data || []).map((img) => {
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(img.storage_path)
    return { ...img, public_url: urlData.publicUrl }
  })

  return NextResponse.json(images)
}

export async function DELETE(request: NextRequest) {
  const { file_name, app_id } = await request.json()

  if (!file_name || !app_id) {
    return NextResponse.json({ error: 'Missing file_name or app_id' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Get storage path
  const { data: img } = await supabase
    .from('question_images')
    .select('storage_path')
    .eq('app_id', app_id)
    .eq('file_name', file_name)
    .single()

  if (img) {
    // Delete from storage
    await supabase.storage.from(BUCKET).remove([img.storage_path])
    // Delete metadata
    await supabase.from('question_images').delete().eq('app_id', app_id).eq('file_name', file_name)
  }

  return NextResponse.json({ deleted: true })
}
