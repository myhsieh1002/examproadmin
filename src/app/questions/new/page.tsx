'use client'
import { useState, useEffect, useRef } from 'react'
import { useCurrentApp } from '@/hooks/useCurrentApp'
import { useRouter } from 'next/navigation'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

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
    image_name: null as string | null,
  })
  const [saving, setSaving] = useState(false)
  const [loadingId, setLoadingId] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

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

        {/* Image */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>Image</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  padding: '6px 14px', backgroundColor: uploading ? '#ccc' : '#0f3460', color: 'white',
                  border: 'none', borderRadius: '6px', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '13px',
                }}
              >
                {uploading ? 'Uploading...' : question.image_name ? 'Replace Image' : 'Upload Image'}
              </button>
              {question.image_name && (
                <button
                  onClick={() => { setQuestion({ ...question, image_name: null }); setUploadMsg('') }}
                  style={{
                    padding: '6px 14px', backgroundColor: '#dc3545', color: 'white',
                    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setUploading(true); setUploadMsg('')
              const formData = new FormData()
              formData.append('file', file)
              formData.append('app_id', currentApp)
              try {
                const res = await fetch('/api/images', { method: 'POST', body: formData })
                if (res.ok) {
                  const data = await res.json()
                  setQuestion(prev => ({ ...prev, image_name: data.file_name }))
                  setUploadMsg('Image uploaded.')
                } else {
                  const err = await res.json()
                  setUploadMsg(`Error: ${err.error}`)
                }
              } catch { setUploadMsg('Error: Upload failed') }
              setUploading(false)
              if (fileInputRef.current) fileInputRef.current.value = ''
            }}
          />
          {uploadMsg && <p style={{ fontSize: '13px', color: uploadMsg.startsWith('Error') ? '#c33' : '#16a34a', marginTop: '4px' }}>{uploadMsg}</p>}
          {question.image_name && (
            <div style={{ marginTop: '8px', padding: '12px', border: '1px solid #eee', borderRadius: '8px', backgroundColor: '#fafafa' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${SUPABASE_URL}/storage/v1/object/public/question-images/${currentApp}/${question.image_name}`} alt="Question image" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '6px' }} />
              <p style={{ fontSize: '12px', color: '#999', marginTop: '6px' }}>{question.image_name}</p>
            </div>
          )}
          {!question.image_name && <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>No image attached</p>}
        </div>

        <button onClick={handleSave} disabled={saving} style={{
          padding: '12px', backgroundColor: '#0f3460', color: 'white',
          border: 'none', borderRadius: '8px', fontSize: '16px',
          cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
        }}>{saving ? 'Creating...' : 'Create Question'}</button>
      </div>
    </div>
  )
}
