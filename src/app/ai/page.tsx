'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useCurrentApp } from '@/hooks/useCurrentApp'
import type { Category } from '@/lib/types'

interface LogEntry {
  questionId: string
  status: 'success' | 'error' | 'skipped'
  error?: string
  flagged?: boolean
  category?: string  // for app-wide mode
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

type Scope = 'category' | 'app'

interface AppBatchState {
  active: boolean
  categories: Category[]
  currentIndex: number
  currentJobId: string | null
  totalQuestions: number
  processedQuestions: number
  perCategoryStats: { name: string; total: number; processed: number; status: 'pending' | 'running' | 'done' | 'skipped' | 'error' }[]
  logs: LogEntry[]
  startedAt: string
}

export default function AIGeneratePage() {
  const { currentApp } = useCurrentApp()
  const [scope, setScope] = useState<Scope>('category')
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [activeJob, setActiveJob] = useState<JobState | null>(null)
  const [activeJobs, setActiveJobs] = useState<JobState[]>([])
  const [message, setMessage] = useState('')
  const [appBatch, setAppBatch] = useState<AppBatchState | null>(null)
  const stoppedRef = useRef(false)
  const runningRef = useRef(false)
  const appBatchStoppedRef = useRef(false)
  const appBatchRunningRef = useRef(false)
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
  }, [activeJob?.logs?.length, appBatch?.logs?.length])

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

  // Core: run chunks in a loop for single-category mode
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
          setActiveJob((prev) => prev ? { ...prev, status: data.status || 'error' } : prev)
          break
        }

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
        await new Promise((r) => setTimeout(r, 3000))
      }
    }

    runningRef.current = false
    try {
      const res = await fetch('/api/ai/batch-status?list=active')
      if (res.ok) setActiveJobs(await res.json())
    } catch { /* ignore */ }
  }, [])

  // App-wide mode: run a single category as part of the larger batch
  const runAppCategoryChunkLoop = useCallback(async (jobId: string, categoryName: string): Promise<{ done: boolean; results: LogEntry[] }> => {
    const allResults: LogEntry[] = []
    while (!appBatchStoppedRef.current) {
      try {
        const res = await fetch('/api/ai/batch-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resume', job_id: jobId }),
        })
        const data = await res.json()

        if (!res.ok || data.error) {
          return { done: false, results: allResults }
        }

        const taggedResults: LogEntry[] = (data.results || []).map((r: LogEntry) => ({ ...r, category: categoryName }))
        allResults.push(...taggedResults)

        // Live update app batch state
        setAppBatch((prev) => {
          if (!prev) return prev
          const newLogs = [...prev.logs, ...taggedResults]
          const newStats = [...prev.perCategoryStats]
          newStats[prev.currentIndex] = { ...newStats[prev.currentIndex], processed: data.current }
          return {
            ...prev,
            processedQuestions: prev.processedQuestions + taggedResults.length,
            perCategoryStats: newStats,
            logs: newLogs,
          }
        })

        if (data.status === 'done') return { done: true, results: allResults }
      } catch {
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
    return { done: false, results: allResults }
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
    runChunkLoop(data.job_id)
  }

  // App-wide batch: iterate through all categories sequentially
  const handleStartAppBatch = async () => {
    if (appBatchRunningRef.current) return
    setMessage('')

    if (categories.length === 0) {
      setMessage('No categories found for this app.')
      return
    }

    appBatchRunningRef.current = true
    appBatchStoppedRef.current = false

    const totalQuestions = categories.reduce((sum, c) => sum + c.question_count, 0)

    const initialState: AppBatchState = {
      active: true,
      categories,
      currentIndex: 0,
      currentJobId: null,
      totalQuestions,
      processedQuestions: 0,
      perCategoryStats: categories.map((c) => ({
        name: c.name, total: c.question_count, processed: 0, status: 'pending' as const,
      })),
      logs: [],
      startedAt: new Date().toISOString(),
    }
    setAppBatch(initialState)

    for (let i = 0; i < categories.length; i++) {
      if (appBatchStoppedRef.current) break

      const cat = categories[i]
      setAppBatch((prev) => {
        if (!prev) return prev
        const newStats = [...prev.perCategoryStats]
        newStats[i] = { ...newStats[i], status: 'running' }
        return { ...prev, currentIndex: i, perCategoryStats: newStats }
      })

      // Create job for this category
      const createRes = await fetch('/api/ai/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: currentApp, category: cat.name, overwrite }),
      })
      const createData = await createRes.json()

      // Handle "already has job" or "no questions to process"
      if (createData.error && (createData.total === 0 || !createData.job_id)) {
        // Skip this category
        setAppBatch((prev) => {
          if (!prev) return prev
          const newStats = [...prev.perCategoryStats]
          newStats[i] = { ...newStats[i], status: 'skipped', processed: newStats[i].total }
          return { ...prev, perCategoryStats: newStats }
        })
        continue
      }

      if (!createData.job_id) {
        setAppBatch((prev) => {
          if (!prev) return prev
          const newStats = [...prev.perCategoryStats]
          newStats[i] = { ...newStats[i], status: 'error' }
          return { ...prev, perCategoryStats: newStats }
        })
        continue
      }

      setAppBatch((prev) => prev ? { ...prev, currentJobId: createData.job_id } : prev)

      // Update per-category total to match the jobs' actual count (may differ due to skipped-with-explanation)
      setAppBatch((prev) => {
        if (!prev) return prev
        const newStats = [...prev.perCategoryStats]
        newStats[i] = { ...newStats[i], total: createData.total }
        return { ...prev, perCategoryStats: newStats }
      })

      const { done } = await runAppCategoryChunkLoop(createData.job_id, cat.name)

      setAppBatch((prev) => {
        if (!prev) return prev
        const newStats = [...prev.perCategoryStats]
        newStats[i] = { ...newStats[i], status: done ? 'done' : 'error' }
        return { ...prev, perCategoryStats: newStats }
      })

      if (appBatchStoppedRef.current) break
    }

    setAppBatch((prev) => prev ? { ...prev, active: false, currentJobId: null } : prev)
    appBatchRunningRef.current = false
    appBatchStoppedRef.current = false
    setMessage('App-wide batch finished.')

    // Refresh active jobs list
    try {
      const res = await fetch('/api/ai/batch-status?list=active')
      if (res.ok) setActiveJobs(await res.json())
    } catch { /* ignore */ }
  }

  const handleStopAppBatch = async () => {
    appBatchStoppedRef.current = true
    if (appBatch?.currentJobId) {
      await fetch('/api/ai/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', job_id: appBatch.currentJobId }),
      })
    }
    setAppBatch((prev) => prev ? { ...prev, active: false } : prev)
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
      if (data.status === 'running') {
        runChunkLoop(jobId)
      }
    }
  }

  const isRunning = activeJob?.status === 'running'
  const pct = activeJob && activeJob.total > 0 ? Math.round((activeJob.current / activeJob.total) * 100) : 0
  const appBatchPct = appBatch && appBatch.totalQuestions > 0
    ? Math.round((appBatch.processedQuestions / appBatch.totalQuestions) * 100)
    : 0

  const statusLabel = (status: string) => {
    switch (status) {
      case 'running': return '🔄 Running'
      case 'stopping': return '⏳ Stopping...'
      case 'done': return '✅ Completed'
      case 'stopped': return '⏹️ Stopped'
      case 'error': return '❌ Error'
      case 'skipped': return '⏭️ Skipped'
      case 'pending': return '⏸️ Pending'
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
      case 'skipped': return '#9ca3af'
      case 'pending': return '#d1d5db'
      default: return '#666'
    }
  }

  const totalCategoryQuestions = categories.reduce((s, c) => s + c.question_count, 0)

  return (
    <div style={{ maxWidth: '900px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>AI Batch Generate Explanations</h2>

      {/* Scope Toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => setScope('category')}
          disabled={appBatchRunningRef.current}
          style={{
            padding: '8px 18px',
            backgroundColor: scope === 'category' ? '#7c3aed' : 'white',
            color: scope === 'category' ? 'white' : '#666',
            border: scope === 'category' ? 'none' : '1px solid #ddd',
            borderRadius: '8px', fontSize: '14px', fontWeight: '600',
            cursor: appBatchRunningRef.current ? 'not-allowed' : 'pointer',
          }}
        >
          Single Category
        </button>
        <button
          onClick={() => setScope('app')}
          disabled={runningRef.current}
          style={{
            padding: '8px 18px',
            backgroundColor: scope === 'app' ? '#7c3aed' : 'white',
            color: scope === 'app' ? 'white' : '#666',
            border: scope === 'app' ? 'none' : '1px solid #ddd',
            borderRadius: '8px', fontSize: '14px', fontWeight: '600',
            cursor: runningRef.current ? 'not-allowed' : 'pointer',
          }}
        >
          Entire App
        </button>
      </div>

      {/* === Category Mode === */}
      {scope === 'category' && (
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
      )}

      {/* === App-Wide Mode === */}
      {scope === 'app' && (
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #eee', marginBottom: '24px' }}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px' }}>
              Target: <span style={{ color: '#7c3aed' }}>{currentApp}</span>
              <span style={{ marginLeft: '12px', color: '#666', fontWeight: 'normal' }}>
                {categories.length} categories · {totalCategoryQuestions.toLocaleString()} questions total
              </span>
            </div>
            <div style={{
              backgroundColor: '#f9f9f9', padding: '12px', borderRadius: '8px',
              maxHeight: '160px', overflowY: 'auto', fontSize: '13px',
            }}>
              {categories.map((c, i) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span><span style={{ color: '#999' }}>{i + 1}.</span> {c.name}</span>
                  <span style={{ color: '#666' }}>{c.question_count} q</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              <span>Overwrite existing explanations</span>
            </label>
          </div>

          {message && (
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '6px' }}>
              {message}
            </p>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleStartAppBatch}
              disabled={appBatchRunningRef.current || categories.length === 0}
              style={{
                padding: '12px 24px',
                backgroundColor: !appBatchRunningRef.current && categories.length > 0 ? '#7c3aed' : '#ccc',
                color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px',
                cursor: !appBatchRunningRef.current && categories.length > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              Start App-wide Batch
            </button>
            {appBatchRunningRef.current && (
              <button
                onClick={handleStopAppBatch}
                style={{
                  padding: '12px 24px', backgroundColor: '#dc3545',
                  color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', cursor: 'pointer',
                }}
              >
                Stop
              </button>
            )}
          </div>
        </div>
      )}

      {/* App-wide Progress Panel */}
      {scope === 'app' && appBatch && (
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #eee', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '600' }}>
                App-wide Batch: {appBatch.processedQuestions.toLocaleString()} / {appBatch.totalQuestions.toLocaleString()} questions
              </div>
              <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                {appBatch.active
                  ? `Processing category ${appBatch.currentIndex + 1} / ${appBatch.categories.length}: ${appBatch.perCategoryStats[appBatch.currentIndex]?.name}`
                  : 'Finished'}
              </div>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#7c3aed' }}>{appBatchPct}%</div>
          </div>

          <div style={{ width: '100%', height: '10px', backgroundColor: '#e5e7eb', borderRadius: '5px', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{
              width: `${appBatchPct}%`, height: '100%', backgroundColor: '#7c3aed',
              borderRadius: '5px', transition: 'width 0.3s',
            }} />
          </div>

          {/* Per-category breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {appBatch.perCategoryStats.map((s, i) => {
              const p = s.total > 0 ? Math.round((s.processed / s.total) * 100) : 0
              return (
                <div key={s.name} style={{
                  padding: '8px 12px', borderRadius: '6px',
                  backgroundColor: i === appBatch.currentIndex && appBatch.active ? '#f3e8ff' : '#f9f9f9',
                  border: i === appBatch.currentIndex && appBatch.active ? '1px solid #c4b5fd' : '1px solid transparent',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px' }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: '600', marginRight: '8px',
                        backgroundColor: statusColor(s.status) + '20', color: statusColor(s.status),
                      }}>
                        {statusLabel(s.status)}
                      </span>
                      {s.name}
                    </span>
                    <span style={{ fontSize: '12px', color: '#666' }}>{s.processed} / {s.total} ({p}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '3px', backgroundColor: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${p}%`, height: '100%', backgroundColor: statusColor(s.status),
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* App-wide Log */}
      {scope === 'app' && appBatch && appBatch.logs.length > 0 && (
        <div style={{
          backgroundColor: 'white', padding: '16px', borderRadius: '12px',
          border: '1px solid #eee', maxHeight: '400px', overflowY: 'auto', marginBottom: '24px',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
            App-wide Log ({appBatch.logs.length} entries)
          </h3>
          {appBatch.logs.slice(-200).map((log, i) => (
            <div key={i} style={{
              padding: '6px 0', borderBottom: '1px solid #f5f5f5', fontSize: '13px', fontFamily: 'monospace',
              color: log.status === 'error' ? '#dc2626' : '#333',
            }}>
              <span style={{ color: '#999', marginRight: '8px' }}>[{log.category}]</span>
              <span style={{ marginRight: '8px' }}>{log.questionId}</span>
              <span style={{ color: log.status === 'success' ? '#16a34a' : log.status === 'skipped' ? '#999' : '#dc2626' }}>
                {log.status === 'success' ? 'OK' : log.status === 'skipped' ? 'SKIPPED' : `ERROR: ${log.error}`}
              </span>
              {log.flagged && <span style={{ color: '#f59e0b', marginLeft: '8px', fontWeight: '600' }}>⚠️ FLAGGED</span>}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}

      {/* Active Jobs (always visible) */}
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

      {/* Selected Job Detail (single category mode) */}
      {scope === 'category' && activeJob && activeJob.total > 0 && (
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

      {/* Single-category Log */}
      {scope === 'category' && activeJob?.logs && activeJob.logs.length > 0 && (
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
              {log.flagged && <span style={{ color: '#f59e0b', marginLeft: '8px', fontWeight: '600' }}>⚠️ FLAGGED</span>}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  )
}
