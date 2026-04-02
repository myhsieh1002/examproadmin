'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentApp } from '@/hooks/useCurrentApp'
import type { App, Category } from '@/lib/types'

interface ExplanationStats {
  app: { total: number; withExplanation: number }
  categories: Record<string, { total: number; withExplanation: number }>
}

export default function DashboardPage() {
  const { currentApp, setCurrentApp } = useCurrentApp()
  const router = useRouter()
  const [apps, setApps] = useState<App[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [allStats, setAllStats] = useState<Record<string, ExplanationStats>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [appsRes, catsRes, statsRes] = await Promise.all([
        fetch('/api/questions?action=apps'),
        fetch(`/api/questions?action=categories&app_id=${currentApp}`),
        fetch(`/api/questions?action=explanation-stats&app_id=${currentApp}`),
      ])
      if (appsRes.ok) {
        const appsData = await appsRes.json()
        setApps(appsData)
        // Fetch stats for all apps
        const statsMap: Record<string, ExplanationStats> = {}
        const statsPromises = appsData.map(async (app: App) => {
          if (app.id === currentApp && statsRes.ok) {
            statsMap[app.id] = await statsRes.json()
          } else {
            const r = await fetch(`/api/questions?action=explanation-stats&app_id=${app.id}`)
            if (r.ok) statsMap[app.id] = await r.json()
          }
        })
        await Promise.all(statsPromises)
        setAllStats(statsMap)
      }
      if (catsRes.ok) setCategories(await catsRes.json())
      setLoading(false)
    }
    load()
  }, [currentApp])

  if (loading) return <p>Loading...</p>

  const current = apps.find(a => a.id === currentApp)
  const currentStats = allStats[currentApp]

  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>Dashboard</h2>

      {/* App Cards */}
      <div className="dashboard-grid">
        {apps.map(app => {
          const st = allStats[app.id]
          const expCount = st?.app.withExplanation || 0
          const expTotal = st?.app.total || app.total_questions
          const pct = expTotal > 0 ? Math.round((expCount / expTotal) * 100) : 0

          return (
            <div key={app.id} onClick={() => setCurrentApp(app.id)} style={{
              backgroundColor: app.id === currentApp ? '#e8f4fd' : 'white',
              border: app.id === currentApp ? '2px solid #0f3460' : '1px solid #eee',
              borderRadius: '12px',
              padding: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}>
              <p style={{ fontSize: '14px', color: '#666' }}>{app.display_name}</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold', margin: '8px 0' }}>{app.total_questions}</p>
              <p style={{ fontSize: '12px', color: '#999' }}>v{app.version} | {new Date(app.last_updated).toLocaleDateString()}</p>
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #eee' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#666' }}>Explanations</span>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: pct === 100 ? '#16a34a' : '#666' }}>
                    {expCount} / {expTotal} ({pct}%)
                  </span>
                </div>
                <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%',
                    backgroundColor: pct === 100 ? '#16a34a' : pct > 50 ? '#f59e0b' : '#ef4444',
                    borderRadius: '2px', transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Categories for current app */}
      {current && (
        <>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
            {current.display_name} - Categories
          </h3>
          <div className="table-wrapper">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', color: '#666' }}>Category</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', color: '#666' }}>Explanations</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', color: '#666' }}>Questions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => {
                  const catSt = currentStats?.categories[cat.name]
                  const expCount = catSt?.withExplanation || 0
                  const expTotal = catSt?.total || cat.question_count
                  const pct = expTotal > 0 ? Math.round((expCount / expTotal) * 100) : 0

                  return (
                    <tr
                      key={cat.id}
                      onClick={() => router.push(`/questions?category=${encodeURIComponent(cat.name)}`)}
                      style={{ borderTop: '1px solid #f0f0f0', cursor: 'pointer', transition: 'background-color 0.15s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f0f7ff')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                    >
                      <td style={{ padding: '12px 16px', fontSize: '14px' }}>{cat.name}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px' }}>
                        <span style={{ color: pct === 100 ? '#16a34a' : '#666' }}>
                          {expCount} / {expTotal}
                        </span>
                        <span style={{ color: '#999', marginLeft: '6px', fontSize: '12px' }}>({pct}%)</span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', fontWeight: '600' }}>{cat.question_count}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
