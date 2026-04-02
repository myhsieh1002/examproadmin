'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useCurrentApp } from '@/hooks/useCurrentApp'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

export default function EditQuestionPage() {
  const router = useRouter()
  const params = useParams()
  const { userId, currentApp } = useCurrentApp()
  const id = params.id as string
  const [question, setQuestion] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [editorName, setEditorName] = useState<string | null>(null)
  const [prevId, setPrevId] = useState<string | null>(null)
  const [nextId, setNextId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/questions/${id}`).then(r => r.json()).then(data => {
      setQuestion(data)
      // Fetch editor name if last_edited_by exists
      if (data.last_edited_by) {
        fetch('/api/users').then(r => r.json()).then((users: any[]) => {
          const editor = users.find((u: any) => u.id === data.last_edited_by)
          if (editor) setEditorName(editor.display_name || editor.email)
        }).catch(() => {})
      }
      // Fetch prev/next IDs
      if (data.app_id) {
        fetch(`/api/questions?app_id=${data.app_id}&action=neighbors&id=${id}`)
          .then(r => r.ok ? r.json() : null)
          .then(nav => {
            if (nav) {
              setPrevId(nav.prev || null)
              setNextId(nav.next || null)
            }
          })
          .catch(() => {})
      }
    })
  }, [id])

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    const { explanation_decrypted, created_at, updated_at, last_edited_by, last_edited_at, ...body } = question
    if (explanation_decrypted !== undefined) {
      body.explanation = explanation_decrypted
    }
    body.edited_by_user_id = userId
    const res = await fetch(`/api/questions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setMessage('Saved successfully!')
    } else {
      const err = await res.json()
      setMessage(`Error: ${err.error}`)
    }
    setSaving(false)
  }

  const handleGenerateAI = async () => {
    setGenerating(true)
    setMessage('')
    try {
      const res = await fetch('/api/ai/generate-explanation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.question,
          options: question.options,
          answer: question.answer,
          category: question.category,
          source: question.source,
        }),
      })
      if (res.ok) {
        const { explanation } = await res.json()
        setQuestion({ ...question, explanation_decrypted: explanation })
        setMessage('AI explanation generated. Review and save.')
      } else {
        const err = await res.json()
        setMessage(`Error: ${err.error}`)
      }
    } catch {
      setMessage('Error: Failed to connect to AI service')
    }
    setGenerating(false)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setMessage('')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('app_id', question.app_id || currentApp)
    try {
      const res = await fetch('/api/images', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        setQuestion({ ...question, image_name: data.file_name })
        setMessage('Image uploaded. Remember to Save.')
      } else {
        const err = await res.json()
        setMessage(`Error: ${err.error}`)
      }
    } catch {
      setMessage('Error: Failed to upload image')
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const imageUrl = question?.image_name
    ? `${SUPABASE_URL}/storage/v1/object/public/question-images/${question.app_id || currentApp}/${question.image_name}`
    : null

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this question?')) return
    await fetch(`/api/questions/${id}`, { method: 'DELETE' })
    router.push('/questions')
  }

  if (!question) return <p>Loading...</p>

  return (
    <div style={{ maxWidth: '800px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Edit Question</h2>
        <button onClick={handleDelete} style={{
          padding: '8px 16px', backgroundColor: '#dc3545', color: 'white',
          border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px'
        }}>Delete</button>
      </div>

      {message && (
        <div style={{
          padding: '12px', borderRadius: '8px', marginBottom: '16px',
          backgroundColor: message.startsWith('Error') ? '#fee' : '#d4edda',
          color: message.startsWith('Error') ? '#c33' : '#155724',
        }}>{message}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #eee' }}>
        <label style={{ fontSize: '14px', fontWeight: '600' }}>ID
          <input value={question.id} disabled style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px', backgroundColor: '#f5f5f5' }} />
        </label>

        <label style={{ fontSize: '14px', fontWeight: '600' }}>Question
          <textarea
            value={question.question}
            onChange={(e) => setQuestion({ ...question, question: e.target.value })}
            rows={3}
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px', resize: 'vertical' }}
          />
        </label>

        {question.options?.map((opt: string, i: number) => (
          <label key={i} style={{ fontSize: '14px', fontWeight: '600' }}>
            Option {String.fromCharCode(65 + i)} {i === question.answer && '\u2705'}
            <input
              value={opt}
              onChange={(e) => {
                const newOpts = [...question.options]
                newOpts[i] = e.target.value
                setQuestion({ ...question, options: newOpts })
              }}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px', backgroundColor: i === question.answer ? '#e8f5e9' : 'white' }}
            />
          </label>
        ))}

        <label style={{ fontSize: '14px', fontWeight: '600' }}>Correct Answer
          <select
            value={question.answer}
            onChange={(e) => setQuestion({ ...question, answer: parseInt(e.target.value) })}
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px' }}
          >
            {question.options?.map((_: string, i: number) => (
              <option key={i} value={i}>{String.fromCharCode(65 + i)}</option>
            ))}
          </select>
        </label>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>Explanation (encrypted)</span>
            <button
              onClick={handleGenerateAI}
              disabled={generating}
              style={{
                padding: '6px 14px',
                backgroundColor: generating ? '#ccc' : '#7c3aed',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: generating ? 'not-allowed' : 'pointer',
                fontSize: '13px',
              }}
            >
              {generating ? 'Generating...' : 'AI Generate'}
            </button>
          </div>
          <textarea
            value={question.explanation_decrypted || ''}
            onChange={(e) => setQuestion({ ...question, explanation_decrypted: e.target.value })}
            rows={6}
            placeholder="Enter explanation..."
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <label style={{ fontSize: '14px', fontWeight: '600' }}>Category
            <input value={question.category} onChange={(e) => setQuestion({ ...question, category: e.target.value })}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px' }} />
          </label>
          <label style={{ fontSize: '14px', fontWeight: '600' }}>Difficulty
            <select value={question.difficulty} onChange={(e) => setQuestion({ ...question, difficulty: parseInt(e.target.value) })}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px' }}>
              <option value={1}>1 - Easy</option>
              <option value={2}>2 - Medium</option>
              <option value={3}>3 - Hard</option>
            </select>
          </label>
        </div>

        <label style={{ fontSize: '14px', fontWeight: '600' }}>Source
          <input value={question.source || ''} onChange={(e) => setQuestion({ ...question, source: e.target.value })}
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px' }} />
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
                  onClick={() => setQuestion({ ...question, image_name: null })}
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
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageUpload} style={{ display: 'none' }} />
          {imageUrl && (
            <div style={{ marginTop: '8px', padding: '12px', border: '1px solid #eee', borderRadius: '8px', backgroundColor: '#fafafa' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Question image" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '6px' }} />
              <p style={{ fontSize: '12px', color: '#999', marginTop: '6px' }}>{question.image_name}</p>
            </div>
          )}
          {!question.image_name && (
            <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>No image attached</p>
          )}
        </div>

        {/* Last editor info */}
        {(editorName || question.last_edited_at) && (
          <div style={{ fontSize: '13px', color: '#888', borderTop: '1px solid #f0f0f0', paddingTop: '12px' }}>
            {editorName && <span>Last edited by: <strong>{editorName}</strong></span>}
            {question.last_edited_at && (
              <span style={{ marginLeft: editorName ? '16px' : '0' }}>
                {new Date(question.last_edited_at).toLocaleString('zh-TW')}
              </span>
            )}
          </div>
        )}

        {/* Prev / Next Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '8px' }}>
          <button
            onClick={() => prevId && router.push(`/questions/${prevId}`)}
            disabled={!prevId}
            style={{
              flex: 1, padding: '10px', backgroundColor: 'white', color: prevId ? '#0f3460' : '#ccc',
              border: `1px solid ${prevId ? '#0f3460' : '#ddd'}`, borderRadius: '8px', fontSize: '14px',
              cursor: prevId ? 'pointer' : 'not-allowed',
            }}
          >
            ← Prev
          </button>
          <button
            onClick={() => nextId && router.push(`/questions/${nextId}`)}
            disabled={!nextId}
            style={{
              flex: 1, padding: '10px', backgroundColor: 'white', color: nextId ? '#0f3460' : '#ccc',
              border: `1px solid ${nextId ? '#0f3460' : '#ddd'}`, borderRadius: '8px', fontSize: '14px',
              cursor: nextId ? 'pointer' : 'not-allowed',
            }}
          >
            Next →
          </button>
        </div>

        <button onClick={handleSave} disabled={saving} style={{
          padding: '12px', backgroundColor: '#0f3460', color: 'white',
          border: 'none', borderRadius: '8px', fontSize: '16px',
          cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
          marginTop: '4px'
        }}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
