import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { decrypt } from '@/lib/encryption'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const appId = searchParams.get('app_id')
  const category = searchParams.get('category')
  const format = searchParams.get('format') || 'json' // 'json' or 'csv'
  const includeExplanation = searchParams.get('explanation') === 'true'

  if (!appId) {
    return NextResponse.json({ error: 'Missing app_id' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Fetch all questions (paginated to bypass 1000 limit)
  const allQuestions: any[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    let query = supabase
      .from('questions')
      .select('*')
      .eq('app_id', appId)
      .order('id')
      .range(from, from + pageSize - 1)

    if (category) query = query.eq('category', category)

    const { data: batch, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!batch || batch.length === 0) break
    allQuestions.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }

  // Process questions
  const processed = allQuestions.map((q) => {
    const row: Record<string, unknown> = {
      id: q.id,
      app_id: q.app_id,
      question: q.question,
      options: q.options,
      answer: q.answer,
      answer_letter: String.fromCharCode(65 + q.answer),
      is_multiple_choice: q.is_multiple_choice,
      correct_answers: q.correct_answers,
      category: q.category,
      subcategory: q.subcategory,
      difficulty: q.difficulty,
      tags: q.tags,
      image_name: q.image_name,
      source: q.source,
      version: q.version,
      group_id: q.group_id,
      group_order: q.group_order,
      is_published: q.is_published,
      has_explanation: !!q.explanation_encrypted,
      created_at: q.created_at,
      updated_at: q.updated_at,
    }
    if (includeExplanation && q.explanation_encrypted) {
      row.explanation = decrypt(q.explanation_encrypted)
    }
    return row
  })

  if (format === 'csv') {
    // Generate CSV
    const headers = [
      'id', 'app_id', 'question',
      'option_a', 'option_b', 'option_c', 'option_d',
      'answer', 'answer_letter', 'is_multiple_choice',
      'category', 'subcategory', 'difficulty',
      'tags', 'image_name', 'source',
      'has_explanation',
      ...(includeExplanation ? ['explanation'] : []),
      'created_at', 'updated_at',
    ]

    const escapeCSV = (val: unknown): string => {
      if (val === null || val === undefined) return ''
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = processed.map((q) => {
      const opts = (q.options as string[]) || []
      const vals = [
        q.id, q.app_id, q.question,
        opts[0] || '', opts[1] || '', opts[2] || '', opts[3] || '',
        q.answer, q.answer_letter, q.is_multiple_choice,
        q.category, q.subcategory, q.difficulty,
        JSON.stringify(q.tags || []), q.image_name, q.source,
        q.has_explanation,
        ...(includeExplanation ? [(q as Record<string, unknown>).explanation || ''] : []),
        q.created_at, q.updated_at,
      ]
      return vals.map(escapeCSV).join(',')
    })

    const csv = [headers.join(','), ...rows].join('\n')
    const fileName = category
      ? `${appId}_${category}_${new Date().toISOString().slice(0, 10)}.csv`
      : `${appId}_all_${new Date().toISOString().slice(0, 10)}.csv`

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  }

  // JSON format
  const fileName = category
    ? `${appId}_${category}_${new Date().toISOString().slice(0, 10)}.json`
    : `${appId}_all_${new Date().toISOString().slice(0, 10)}.json`

  return new Response(JSON.stringify(processed, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
