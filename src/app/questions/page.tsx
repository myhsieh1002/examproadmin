'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useCurrentApp } from '@/hooks/useCurrentApp'
import Link from 'next/link'
import type { Question, Category } from '@/lib/types'

export default function QuestionsPage() {
  const { currentApp } = useCurrentApp()
  const searchParams = useSearchParams()
  const [questions, setQuestions] = useState<Question[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(searchParams.get('category') || '')
  const [difficulty, setDifficulty] = useState('')
  const [loading, setLoading] = useState(true)

  // Sync category from URL search params
  useEffect(() => {
    const urlCategory = searchParams.get('category') || ''
    if (urlCategory !== category) {
      setCategory(urlCategory)
    }
  }, [searchParams])

  useEffect(() => {
    setPage(1)
  }, [currentApp, search, category, difficulty])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const params = new URLSearchParams({
        app_id: currentApp,
        page: page.toString(),
        limit: '50',
      })
      if (search) params.set('search', search)
      if (category) params.set('category', category)
      if (difficulty) params.set('difficulty', difficulty)

      const [qRes, cRes] = await Promise.all([
        fetch(`/api/questions?${params}`),
        fetch(`/api/questions?action=categories&app_id=${currentApp}`),
      ])

      if (qRes.ok) {
        const data = await qRes.json()
        setQuestions(data.questions || [])
        setTotal(data.total || 0)
      }
      if (cRes.ok) setCategories(await cRes.json())
      setLoading(false)
    }
    load()
  }, [currentApp, page, search, category, difficulty])

  const totalPages = Math.ceil(total / 50)
  const difficultyLabels: Record<number, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' }

  return (
    <div>
      <div className="page-header">
        <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Questions ({total})</h2>
        <Link href="/questions/new" style={{
          padding: '10px 20px',
          backgroundColor: '#0f3460',
          color: 'white',
          borderRadius: '8px',
          textDecoration: 'none',
          fontSize: '14px',
        }}>
          + New Question
        </Link>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search questions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: '10px 14px',
            border: '1px solid #ddd',
            borderRadius: '8px',
            fontSize: '14px',
          }}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
        >
          <option value="">All Difficulties</option>
          <option value="1">Easy</option>
          <option value="2">Medium</option>
          <option value="3">Hard</option>
        </select>
      </div>

      {/* Table */}
      {loading ? <p>Loading...</p> : (
        <div className="table-wrapper">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666', width: '140px' }}>ID</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666' }}>Question</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666', width: '160px' }}>Category</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '13px', color: '#666', width: '80px' }}>Diff</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '13px', color: '#666', width: '60px' }}>Ans</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '13px', color: '#666', width: '50px' }}>Exp</th>
              </tr>
            </thead>
            <tbody>
              {questions.map(q => (
                <tr key={q.id} style={{ borderTop: '1px solid #f0f0f0', cursor: 'pointer' }}>
                  <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: 'monospace', color: '#666' }}>
                    <Link href={`/questions/${q.id}`} style={{ color: '#0f3460', textDecoration: 'none' }}>{q.id}</Link>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                    {q.tags?.includes('answer_disputed') && <span title="Answer disputed by AI" style={{ marginRight: '4px' }}>⚠️</span>}
                    {q.image_name && <span title="Has image" style={{ marginRight: '4px' }}>📷</span>}
                    {q.question.length > 80 ? q.question.slice(0, 80) + '...' : q.question}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#666' }}>{q.category}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px' }}>
                    {difficultyLabels[q.difficulty] || q.difficulty}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>
                    {String.fromCharCode(65 + q.answer)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
                      backgroundColor: q.explanation_encrypted ? '#16a34a' : '#ef4444',
                    }} title={q.explanation_encrypted ? 'Has explanation' : 'No explanation'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '16px' }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '6px', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}
              >Prev</button>
              <span style={{ padding: '8px 16px', fontSize: '14px' }}>Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '6px', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}
              >Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
