'use client'
import { useState, useEffect } from 'react'
import { useCurrentApp } from '@/hooks/useCurrentApp'
import { useRouter } from 'next/navigation'

export default function NewQuestionPage() {
  const { currentApp, userId } = useCurrentApp()
  const router = useRouter()
  const [question, setQuestion] = useState({
    id: '',
    question: '',
    options: ['', '', '', ''],
    answer: 0,
    explanation: '',
    category: '',
    difficulty: 2,
    source: '',
    tags: [] as string[],
  })
  const [saving, setSaving] = useState(false)
  const [loadingId, setLoadingId] = useState(false)

  const fetchNextId = async () => {
    setLoadingId(true)
    try {
      const res = await fetch(`/api/questions/next-id?app_id=${currentApp}`)
      if (res.ok) {
        const { id } = await res.json()
        setQuestion(prev => ({ ...prev, id }))
      }
    } catch { /* ignore */ }
    setLoadingId(false)
  }

  useEffect(() => {
    fetchNextId()
  }, [currentApp])

  const handleSave = async () => {
    if (!question.id || !question.question || !question.category) {
      alert('Please fill in ID, Question, and Category')
      return
    }
    setSaving(true)
    const res = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...question, app_id: currentApp, edited_by_user_id: userId }),
    })
    if (res.ok) {
      router.push('/questions')
    } else {
      const err = await res.json()
      alert(`Error: ${err.error}`)
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: '800px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>New Question</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #eee' }}>
        <label style={{ fontSize: '14px', fontWeight: '600' }}>ID
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <input value={question.id} onChange={(e) => setQuestion({ ...question, id: e.target.value })}
              placeholder={loadingId ? 'Generating...' : 'e.g., NP-2026-0001'}
              style={{ flex: 1, padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }} />
            <button onClick={fetchNextId} disabled={loadingId}
              title="Regenerate ID"
              style={{
                padding: '10px 14px', backgroundColor: '#f0f0f0', border: '1px solid #ddd',
                borderRadius: '6px', cursor: loadingId ? 'not-allowed' : 'pointer', fontSize: '14px',
              }}>
              {loadingId ? '...' : 'Re-generate'}
            </button>
          </div>
        </label>
        <label style={{ fontSize: '14px', fontWeight: '600' }}>Question
          <textarea value={question.question} onChange={(e) => setQuestion({ ...question, question: e.target.value })}
            rows={3} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px', resize: 'vertical' }} />
        </label>
        {question.options.map((opt, i) => (
          <label key={i} style={{ fontSize: '14px', fontWeight: '600' }}>
            Option {String.fromCharCode(65 + i)}
            <input value={opt} onChange={(e) => {
              const newOpts = [...question.options]; newOpts[i] = e.target.value
              setQuestion({ ...question, options: newOpts })
            }} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px' }} />
          </label>
        ))}
        <label style={{ fontSize: '14px', fontWeight: '600' }}>Correct Answer
          <select value={question.answer} onChange={(e) => setQuestion({ ...question, answer: parseInt(e.target.value) })}
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px' }}>
            <option value={0}>A</option><option value={1}>B</option><option value={2}>C</option><option value={3}>D</option>
          </select>
        </label>
        <label style={{ fontSize: '14px', fontWeight: '600' }}>Category
          <input value={question.category} onChange={(e) => setQuestion({ ...question, category: e.target.value })}
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px' }} />
        </label>
        <label style={{ fontSize: '14px', fontWeight: '600' }}>Explanation
          <textarea value={question.explanation} onChange={(e) => setQuestion({ ...question, explanation: e.target.value })}
            rows={3} placeholder="Enter explanation (will be encrypted)..."
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px', resize: 'vertical' }} />
        </label>
        <button onClick={handleSave} disabled={saving} style={{
          padding: '12px', backgroundColor: '#0f3460', color: 'white',
          border: 'none', borderRadius: '8px', fontSize: '16px',
          cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
        }}>{saving ? 'Creating...' : 'Create Question'}</button>
      </div>
    </div>
  )
}
