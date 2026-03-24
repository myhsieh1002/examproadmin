import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { encrypt } from '@/lib/encryption'
import type { QuestionJSON } from '@/lib/types'

export async function POST(request: NextRequest) {
  const supabase = createServerClient()
  const { app_id, questions } = await request.json() as { app_id: string; questions: QuestionJSON[] }

  if (!app_id || !questions || !Array.isArray(questions)) {
    return NextResponse.json({ error: 'Missing app_id or questions array' }, { status: 400 })
  }

  let inserted = 0
  let updated = 0
  let errors = 0

  // Process in batches of 100
  const batchSize = 100
  for (let i = 0; i < questions.length; i += batchSize) {
    const batch = questions.slice(i, i + batchSize).map((q: QuestionJSON) => ({
      id: q.id,
      app_id,
      question: q.question,
      options: q.options,
      answer: q.answer,
      correct_answers: q.correctAnswers || null,
      is_multiple_choice: q.isMultipleChoice || false,
      explanation_encrypted: q.explanation ? encrypt(q.explanation) : '',
      category: q.category,
      subcategory: q.subcategory || '',
      difficulty: q.difficulty || 2,
      tags: q.tags || [],
      image_name: q.image || null,
      source: q.source || null,
      version: q.version || '1.0',
      group_id: q.groupId || null,
      group_order: q.groupOrder || null,
      is_published: true,
    }))

    const { data, error } = await supabase
      .from('questions')
      .upsert(batch, { onConflict: 'id' })
      .select('id')

    if (error) {
      console.error('Batch error:', error)
      errors += batch.length
    } else {
      // upsert doesn't distinguish insert vs update easily, count all as processed
      inserted += (data?.length || 0)
    }
  }

  return NextResponse.json({
    success: true,
    processed: inserted,
    errors,
    total: questions.length,
  })
}
