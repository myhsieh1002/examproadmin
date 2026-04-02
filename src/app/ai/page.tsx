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
  app_id: string
  category: string
  total: number
  current: number
  success_count: number
  error_count: number
  logs?: LogEntry[]
  started_at: string
  finished_at?: string
}

export default function AIGeneratePage() {
  const { currentApp } = useCurrentApp()
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [activeJob, setActiveJob] = useState<JobState | null>(null)
  const [activeJobs, setActiveJobs] = useState<JobState[]>([])
  const [message, setMessage] = useState('')
  const stoppedRef = useRef(false)
  const runningRef = useRef(false)
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
  }, [activeJob?.logs?.length])

  // Poll active jobs list (for the sidebar panel)
  const pollActiveJobs = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    const tick = async () => {
      try {
        const res = await fetch('/api/ai/batch-status?list=active')
        if (res.ok) setActiveJobs(await res.json())
      } catch { /* ignore */ }
    }
    tick()
    pollRef.current = setInterval(tick, 5000)
  }, [])

  useEffect(() => {
    pollActiveJobs()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [pollActiveJobs])

  // Core: run chunks in a loop
  const runChunkLoop = useCallback(async (jobId: string) => {
    if (runningRef.current) return
    runningRef.current = true
    stoppedRef.current = false

    while (!stoppedRef.current) {
      try {
        const res = await fetch('/api/ai/batch-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resume', job_id: jobId }),
        })

        const data = await res.json()

        if (!res.ok || data.error) {
          // Job was stopped externally or error
          setActiveJob((prev) => prev ? { ...prev, status: data.status || 'error' } : prev)
          break
        }

        // Update local state from response
        setActiveJob((prev) => {
          if (!prev) return prev
          const newLogs = [...(prev.logs || []), ...(data.results || [])]
          return {
            ...prev,
            current: data.current,
            total: data.total,
            success_count: newLogs.filter((l) => l.status === 'success').length,
            error_count: newLogs.filter((l) => l.status === 'error').length,
            logs: newLogs,
            status: data.status,
          }
        })

        if (data.status === 'done') break
      } catch {
        // Network error, wait a bit and retry
        await new Promise((r) => setTimeout(r, 3000))
      }
    }

    runningRef.current = false
    // Refresh active jobs list
    try {
      const res = await fetch('/api/ai/batch-status?list=active')
      if (res.ok) setActiveJobs(await res.json())
    } catch { /* ignore */ }
  }, [])

  const handleStart = async () => {
    setMessage('')

    const res = await fetch('/api/ai/batch-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: currentApp, category: selectedCategory, overwrite }),
    })

    const data = await res.json()

    if (data.error && data.total === 0) {
      setMessage('All questions already have explanations. Check "Overwrite" to regenerate.')
      return
    }

    if (data.existing_job_id) {
      setMessage(data.error)
      handleSelectJob(data.existing_job_id)
      return
    }

    if (!data.job_id) {
      setMessage(`Error: ${data.error || 'Failed to start job'}`)
      return
    }

    setMessage(`Started. Processing ${data.total} questions (${data.skipped} skipped).`)
    const newJob: JobState = {
      id: data.job_id,
      status: 'running',
      app_id: currentApp,
      category: selectedCategory,
      total: data.total,
      current: 0,
      success_count: 0,
      error_count: 0,
      logs: [],
      started_at: new Date().toISOString(),
    }
    setActiveJob(newJob)

    // Start chunk loop
    runChunkLoop(data.job_id)
  }

  const handleStop = async (jobId: string) => {
    stoppedRef.current = true
    await fetch('/api/ai/batch-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop', job_id: jobId }),
    })
    setActiveJob((prev) => prev && prev.id === jobId ? { ...prev, status: 'stopped' } : prev)
  }

  const handleSelectJob = async (jobId: string) => {
    const res = await fetch(`/api/ai/batch-status?job_id=${jobId}`)
    if (res.ok) {
      const data = await res.json()
      setActiveJob(data)
      // If it's running, start driving it
      if (data.status === 'running') {
        runChunkLoop(jobId)
      }
    }
  }

  const isRunning = activeJob?.status === 'running'
  const pct = activeJob && activeJob.total > 0 ? Math.round((activeJob.current / activeJob.total) * 100) : 0

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

  const statusColor = (status: string) => {
    switch (status) {
      case 'running': return '#7c3aed'
      case 'stopping': return '#f59e0b'
      case 'done': return '#16a34a'
      case 'stopped': return '#6b7280'
      case 'error': return '#dc2626'
      default: return '#666'
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
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              <span style={{ fontWeight: 'normal' }}>Overwrite existing explanations</span>
            </div>
          </label>
        </div>

        {message && (
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '6px' }}>
            {message}
          </p>
        )}

        <button
          onClick={handleStart}
          disabled={!selectedCategory || (isRunning && runningRef.current)}
          style={{
            padding: '12px 24px',
            backgroundColor: selectedCategory && !(isRunning && runningRef.current) ? '#7c3aed' : '#ccc',
            color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px',
            cursor: selectedCategory && !(isRunning && runningRef.current) ? 'pointer' : 'not-allowed',
          }}
        >
          Start Batch Generate
        </button>
      </div>

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Active Jobs ({activeJobs.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {activeJobs.map((aj) => {
              const ajPct = aj.total > 0 ? Math.round((aj.current / aj.total) * 100) : 0
              const isSelected = activeJob?.id === aj.id

              return (
                <div key={aj.id} onClick={() => handleSelectJob(aj.id)} style={{
                  backgroundColor: 'white',
                  border: isSelected ? '2px solid #7c3aed' : '1px solid #eee',
                  borderRadius: '10px', padding: '14px 18px', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
                      backgroundColor: statusColor(aj.status) + '20', color: statusColor(aj.status),
                    }}>
                      {statusLabel(aj.status)}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: '600' }}>{aj.category}</span>
                    <span style={{ fontSize: '12px', color: '#999' }}>{aj.app_id}</span>
                    <span style={{ fontSize: '12px', color: '#999', marginLeft: 'auto' }}>
                      {aj.current}/{aj.total} ({ajPct}%)
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStop(aj.id) }}
                      style={{
                        padding: '4px 12px', backgroundColor: '#dc3545', color: 'white',
                        border: 'none', borderRadius: '5px', fontSize: '12px', cursor: 'pointer',
                      }}
                    >
                      Stop
                    </button>
                  </div>
                  <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${ajPct}%`, height: '100%',
                      backgroundColor: statusColor(aj.status), borderRadius: '2px', transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Selected Job Detail */}
      {activeJob && activeJob.total > 0 && (
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #eee', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>
              {statusLabel(activeJob.status)} — {activeJob.category} — {activeJob.current} / {activeJob.total}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '14px', color: '#666' }}>{pct}%</span>
              {activeJob.status === 'running' && (
                <button onClick={() => handleStop(activeJob.id)} style={{
                  padding: '6px 14px', backgroundColor: '#dc3545', color: 'white',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                }}>
                  Stop
                </button>
              )}
            </div>
          </div>

          <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`, height: '100%',
              backgroundColor: activeJob.status === 'done' ? '#16a34a' : activeJob.status === 'error' ? '#dc2626' : '#7c3aed',
              borderRadius: '4px', transition: 'width 0.3s',
            }} />
          </div>

          <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '13px' }}>
            <span style={{ color: '#16a34a' }}>Success: {activeJob.success_count}</span>
            {activeJob.error_count > 0 && <span style={{ color: '#dc2626' }}>Errors: {activeJob.error_count}</span>}
          </div>
        </div>
      )}

      {/* Log */}
      {activeJob?.logs && activeJob.logs.length > 0 && (
        <div style={{
          backgroundColor: 'white', padding: '16px', borderRadius: '12px',
          border: '1px solid #eee', maxHeight: '400px', overflowY: 'auto',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Log — {activeJob.category}</h3>
          {activeJob.logs.map((log, i) => (
            <div key={i} style={{
              padding: '6px 0', borderBottom: '1px solid #f5f5f5', fontSize: '13px', fontFamily: 'monospace',
              color: log.status === 'error' ? '#dc2626' : '#333',
            }}>
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
