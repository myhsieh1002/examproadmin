'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useCurrentApp } from '@/hooks/useCurrentApp'
import type { Category } from '@/lib/types'

interface LogEntry {
  questionId: string
  status: 'success' | 'error' | 'skipped'
  error?: string
}

interface JobState {
  id: string
  status: 'running' | 'stopping' | 'done' | 'stopped' | 'error'
  total: number
  current: number
  success_count: number
  error_count: number
  logs: LogEntry[]
}

export default function AIGeneratePage() {
  const { currentApp } = useCurrentApp()
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [job, setJob] = useState<JobState | null>(null)
  const [message, setMessage] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Load categories
  useEffect(() => {
    fetch(`/api/questions?action=categories&app_id=${currentApp}`)
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {})
    setSelectedCategory('')
  }, [currentApp])

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [job?.logs?.length])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const startPolling = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/batch-status?job_id=${jobId}`)
        if (!res.ok) return
        const data = await res.json()
        setJob(data)

        // Stop polling when job is done
        if (['done', 'stopped', 'error'].includes(data.status)) {
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
        }
      } catch {
        // network error, keep polling
      }
    }, 3000)
  }, [])

  const handleStart = async () => {
    setMessage('')
    setJob(null)

    const res = await fetch('/api/ai/batch-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: currentApp,
        category: selectedCategory,
        overwrite,
      }),
    })

    const data = await res.json()

    if (data.error && data.total === 0) {
      setMessage('All questions in this category already have explanations. Check "Overwrite" to regenerate.')
      return
    }

    if (!data.job_id) {
      setMessage(`Error: ${data.error || 'Failed to start job'}`)
      return
    }

    setMessage(`Job started. Processing ${data.total} questions (${data.skipped} skipped).`)
    setJob({
      id: data.job_id,
      status: 'running',
      total: data.total,
      current: 0,
      success_count: 0,
      error_count: 0,
      logs: [],
    })

    startPolling(data.job_id)
  }

  const handleStop = async () => {
    if (!job) return
    await fetch('/api/ai/batch-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop', job_id: job.id }),
    })
    setMessage('Stopping... will finish current question.')
  }

  const isRunning = job?.status === 'running' || job?.status === 'stopping'
  const pct = job && job.total > 0 ? Math.round((job.current / job.total) * 100) : 0

  const statusLabel = (status: string) => {
    switch (status) {
      case 'running': return '🔄 Running'
      case 'stopping': return '⏳ Stopping...'
      case 'done': return '✅ Completed'
      case 'stopped': return '⏹️ Stopped'
      case 'error': return '❌ Error'
      default: return status
    }
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>AI Batch Generate Explanations</h2>

      {/* Controls */}
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #eee', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <label style={{ fontSize: '14px', fontWeight: '600' }}>
            Category
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={isRunning}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px' }}
            >
              <option value="">-- Select Category --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name} ({c.question_count})
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: '14px', fontWeight: '600', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0' }}>
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                disabled={isRunning}
              />
              <span style={{ fontWeight: 'normal' }}>Overwrite existing explanations</span>
            </div>
          </label>
        </div>

        {message && (
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '6px' }}>
            {message}
          </p>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          {!isRunning ? (
            <button
              onClick={handleStart}
              disabled={!selectedCategory}
              style={{
                padding: '12px 24px',
                backgroundColor: selectedCategory ? '#7c3aed' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                cursor: selectedCategory ? 'pointer' : 'not-allowed',
              }}
            >
              Start Batch Generate
            </button>
          ) : (
            <button
              onClick={handleStop}
              disabled={job?.status === 'stopping'}
              style={{
                padding: '12px 24px',
                backgroundColor: job?.status === 'stopping' ? '#999' : '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                cursor: job?.status === 'stopping' ? 'not-allowed' : 'pointer',
              }}
            >
              {job?.status === 'stopping' ? 'Stopping...' : 'Stop'}
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {job && job.total > 0 && (
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #eee', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>
              {statusLabel(job.status)} — {job.current} / {job.total}
            </span>
            <span style={{ fontSize: '14px', color: '#666' }}>{pct}%</span>
          </div>

          <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                backgroundColor: job.status === 'done' ? '#16a34a' : job.status === 'error' ? '#dc2626' : '#7c3aed',
                borderRadius: '4px',
                transition: 'width 0.3s',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '13px' }}>
            <span style={{ color: '#16a34a' }}>Success: {job.success_count}</span>
            {job.error_count > 0 && <span style={{ color: '#dc2626' }}>Errors: {job.error_count}</span>}
          </div>
        </div>
      )}

      {/* Log */}
      {job && job.logs && job.logs.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid #eee',
          maxHeight: '400px',
          overflowY: 'auto',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Log</h3>
          {job.logs.map((log, i) => (
            <div
              key={i}
              style={{
                padding: '6px 0',
                borderBottom: '1px solid #f5f5f5',
                fontSize: '13px',
                fontFamily: 'monospace',
                color: log.status === 'error' ? '#dc2626' : '#333',
              }}
            >
              <span style={{ color: '#999', marginRight: '8px' }}>[{i + 1}]</span>
              <span style={{ marginRight: '8px' }}>{log.questionId}</span>
              <span style={{ color: log.status === 'success' ? '#16a34a' : log.status === 'skipped' ? '#999' : '#dc2626' }}>
                {log.status === 'success' ? 'OK' : log.status === 'skipped' ? 'SKIPPED' : `ERROR: ${log.error}`}
              </span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  )
}
