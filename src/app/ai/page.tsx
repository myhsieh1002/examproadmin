'use client'
import { useEffect, useState, useRef } from 'react'
import { useCurrentApp } from '@/hooks/useCurrentApp'
import type { Category } from '@/lib/types'

interface LogEntry {
  questionId: string
  status: 'success' | 'error'
  error?: string
}

export default function AIGeneratePage() {
  const { currentApp } = useCurrentApp()
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<{ total: number; withExplanation: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Load categories
  useEffect(() => {
    fetch(`/api/questions?action=categories&app_id=${currentApp}`)
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {})
    setSelectedCategory('')
    setStats(null)
  }, [currentApp])

  // Load stats when category selected
  useEffect(() => {
    if (!selectedCategory) {
      setStats(null)
      return
    }
    async function loadStats() {
      const params = new URLSearchParams({ app_id: currentApp, category: selectedCategory, limit: '1' })
      const res = await fetch(`/api/questions?${params}`)
      if (!res.ok) return
      const { total } = await res.json()

      // Count questions with explanation
      const res2 = await fetch(`/api/ai/batch-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: currentApp, category: selectedCategory, dryRun: true }),
      }).catch(() => null)

      // Simple approach: just show total for now
      setStats({ total, withExplanation: 0 })
    }
    loadStats()
  }, [currentApp, selectedCategory])

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleStart = async () => {
    setRunning(true)
    setLogs([])
    setProgress({ current: 0, total: 0 })

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/ai/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: currentApp,
          category: selectedCategory,
          overwrite,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        setRunning(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'start') {
              setProgress({ current: 0, total: data.total })
            } else if (data.type === 'progress') {
              setProgress({ current: data.current, total: data.total })
              setLogs((prev) => [
                ...prev,
                { questionId: data.questionId, status: data.status, error: data.error },
              ])
            } else if (data.type === 'done') {
              // done
            }
          } catch {
            // skip invalid JSON
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setLogs((prev) => [...prev, { questionId: '-', status: 'error', error: err instanceof Error ? err.message : 'Unknown error' }])
      }
    }

    setRunning(false)
    abortRef.current = null
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
  const successCount = logs.filter((l) => l.status === 'success').length
  const errorCount = logs.filter((l) => l.status === 'error').length

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
              disabled={running}
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
                disabled={running}
              />
              <span style={{ fontWeight: 'normal' }}>Overwrite existing explanations</span>
            </div>
          </label>
        </div>

        {stats && selectedCategory && (
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
            Total questions in this category: <strong>{stats.total}</strong>
          </p>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          {!running ? (
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
              style={{
                padding: '12px 24px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                cursor: 'pointer',
              }}
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {progress.total > 0 && (
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #eee', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>
              Progress: {progress.current} / {progress.total}
            </span>
            <span style={{ fontSize: '14px', color: '#666' }}>{pct}%</span>
          </div>

          {/* Progress bar */}
          <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                backgroundColor: '#7c3aed',
                borderRadius: '4px',
                transition: 'width 0.3s',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '13px' }}>
            <span style={{ color: '#16a34a' }}>Success: {successCount}</span>
            {errorCount > 0 && <span style={{ color: '#dc2626' }}>Errors: {errorCount}</span>}
          </div>
        </div>
      )}

      {/* Log */}
      {logs.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid #eee',
          maxHeight: '400px',
          overflowY: 'auto',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Log</h3>
          {logs.map((log, i) => (
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
              <span style={{ color: log.status === 'success' ? '#16a34a' : '#dc2626' }}>
                {log.status === 'success' ? 'OK' : `ERROR: ${log.error}`}
              </span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  )
}
