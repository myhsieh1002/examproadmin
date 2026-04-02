'use client'
import { useEffect, useState } from 'react'
import { useCurrentApp } from '@/hooks/useCurrentApp'
import Link from 'next/link'

interface FeedbackItem {
  id: string
  app_id: string
  question_id: string | null
  device_id: string
  feedback_type: string
  message: string | null
  status: string
  admin_response: string | null
  admin_responder_id: string | null
  responded_at: string | null
  created_at: string
  questions: { id: string; question: string } | null
}

const TYPE_LABELS: Record<string, string> = {
  wrong_answer: '答案有誤',
  wrong_question: '題目有誤',
  wrong_explanation: '詳解有誤',
  other: '其他',
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  open: { bg: '#fff3cd', color: '#856404', label: 'Open' },
  in_progress: { bg: '#cce5ff', color: '#004085', label: 'In Progress' },
  resolved: { bg: '#d4edda', color: '#155724', label: 'Resolved' },
  rejected: { bg: '#f8d7da', color: '#721c24', label: 'Rejected' },
}

export default function FeedbackPage() {
  const { currentApp, userId } = useCurrentApp()
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyStatus, setReplyStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const limit = 30

  useEffect(() => { setPage(1) }, [currentApp, statusFilter, typeFilter])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const params = new URLSearchParams({ app_id: currentApp, page: page.toString(), limit: limit.toString() })
      if (statusFilter) params.set('status', statusFilter)
      if (typeFilter) params.set('feedback_type', typeFilter)

      const res = await fetch(`/api/feedback?${params}`)
      if (res.ok) {
        const data = await res.json()
        setFeedback(data.feedback || [])
        setTotal(data.total || 0)
      }
      setLoading(false)
    }
    load()
  }, [currentApp, page, statusFilter, typeFilter])

  const handleExpand = (item: FeedbackItem) => {
    if (expandedId === item.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(item.id)
    setReplyText(item.admin_response || '')
    setReplyStatus(item.status)
    setMessage('')
  }

  const handleSaveReply = async (id: string) => {
    setSaving(true)
    setMessage('')
    const res = await fetch(`/api/feedback/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: replyStatus,
        admin_response: replyText || null,
        admin_responder_id: userId,
      }),
    })
    if (res.ok) {
      setMessage('Saved!')
      // Update local state
      setFeedback(prev => prev.map(f =>
        f.id === id ? { ...f, status: replyStatus, admin_response: replyText, responded_at: new Date().toISOString() } : f
      ))
    } else {
      const err = await res.json()
      setMessage(`Error: ${err.error}`)
    }
    setSaving(false)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>Feedback ({total})</h2>

      {/* Filters */}
      <div className="filter-bar" style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
        >
          <option value="">All Types</option>
          <option value="wrong_answer">答案有誤</option>
          <option value="wrong_question">題目有誤</option>
          <option value="wrong_explanation">詳解有誤</option>
          <option value="other">其他</option>
        </select>
      </div>

      {loading ? <p>Loading...</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {feedback.map((item) => {
            const st = STATUS_STYLES[item.status] || STATUS_STYLES.open
            const isExpanded = expandedId === item.id

            return (
              <div key={item.id} style={{
                backgroundColor: 'white',
                borderRadius: '10px',
                border: '1px solid #eee',
                overflow: 'hidden',
              }}>
                {/* Summary Row */}
                <div
                  onClick={() => handleExpand(item)}
                  style={{
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{
                    padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600',
                    backgroundColor: st.bg, color: st.color,
                  }}>
                    {st.label}
                  </span>
                  <span style={{ fontSize: '12px', color: '#999', minWidth: '70px' }}>
                    {TYPE_LABELS[item.feedback_type] || item.feedback_type}
                  </span>
                  {item.question_id && (
                    <Link
                      href={`/questions/${item.question_id}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: '12px', fontFamily: 'monospace', color: '#0f3460', textDecoration: 'none' }}
                    >
                      {item.question_id}
                    </Link>
                  )}
                  <span style={{ flex: 1, fontSize: '14px', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.message || '(no message)'}
                  </span>
                  <span style={{ fontSize: '12px', color: '#aaa', whiteSpace: 'nowrap' }}>
                    {new Date(item.created_at).toLocaleDateString('zh-TW')}
                  </span>
                  <span style={{ fontSize: '14px', color: '#999' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f0f0f0' }}>
                    {/* Question preview */}
                    {item.questions && (
                      <div style={{ padding: '12px', backgroundColor: '#f9f9f9', borderRadius: '8px', marginTop: '12px', marginBottom: '12px' }}>
                        <p style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>Question:</p>
                        <p style={{ fontSize: '14px', color: '#333' }}>
                          {item.questions.question.length > 200
                            ? item.questions.question.slice(0, 200) + '...'
                            : item.questions.question}
                        </p>
                      </div>
                    )}

                    {/* Full message */}
                    {item.message && (
                      <div style={{ marginBottom: '12px' }}>
                        <p style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>User Message:</p>
                        <p style={{ fontSize: '14px', color: '#333', whiteSpace: 'pre-wrap' }}>{item.message}</p>
                      </div>
                    )}

                    <p style={{ fontSize: '12px', color: '#bbb', marginBottom: '12px' }}>
                      Device: {item.device_id.slice(0, 8)}... | {new Date(item.created_at).toLocaleString('zh-TW')}
                    </p>

                    {/* Admin Response */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <label style={{ fontSize: '13px', fontWeight: '600' }}>Status:</label>
                        <select
                          value={replyStatus}
                          onChange={(e) => setReplyStatus(e.target.value)}
                          style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }}
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </div>
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={3}
                        placeholder="Admin response (optional)..."
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', resize: 'vertical' }}
                      />
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          onClick={() => handleSaveReply(item.id)}
                          disabled={saving}
                          style={{
                            padding: '8px 20px', backgroundColor: '#0f3460', color: 'white',
                            border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px',
                          }}
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                        {message && <span style={{ fontSize: '13px', color: message.startsWith('Error') ? '#c33' : '#16a34a' }}>{message}</span>}
                        {item.responded_at && (
                          <span style={{ fontSize: '12px', color: '#aaa', marginLeft: 'auto' }}>
                            Last responded: {new Date(item.responded_at).toLocaleString('zh-TW')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {feedback.length === 0 && (
            <p style={{ textAlign: 'center', color: '#999', padding: '40px' }}>No feedback found</p>
          )}

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
