'use client'
import { useEffect, useState } from 'react'
import { useCurrentApp } from '@/hooks/useCurrentApp'
import type { App, Category } from '@/lib/types'

export default function DashboardPage() {
  const { currentApp } = useCurrentApp()
  const [apps, setApps] = useState<App[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [appsRes, catsRes] = await Promise.all([
        fetch('/api/questions?action=apps'),
        fetch(`/api/questions?action=categories&app_id=${currentApp}`),
      ])
      if (appsRes.ok) setApps(await appsRes.json())
      if (catsRes.ok) setCategories(await catsRes.json())
      setLoading(false)
    }
    load()
  }, [currentApp])

  if (loading) return <p>Loading...</p>

  const current = apps.find(a => a.id === currentApp)

  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>Dashboard</h2>

      {/* App Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
        {apps.map(app => (
          <div key={app.id} style={{
            backgroundColor: app.id === currentApp ? '#e8f4fd' : 'white',
            border: app.id === currentApp ? '2px solid #0f3460' : '1px solid #eee',
            borderRadius: '12px',
            padding: '20px',
          }}>
            <p style={{ fontSize: '14px', color: '#666' }}>{app.display_name}</p>
            <p style={{ fontSize: '32px', fontWeight: 'bold', margin: '8px 0' }}>{app.total_questions}</p>
            <p style={{ fontSize: '12px', color: '#999' }}>v{app.version} | {new Date(app.last_updated).toLocaleDateString()}</p>
          </div>
        ))}
      </div>

      {/* Categories for current app */}
      {current && (
        <>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
            {current.display_name} - Categories
          </h3>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', border: '1px solid #eee' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', color: '#666' }}>Category</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', color: '#666' }}>Questions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => (
                  <tr key={cat.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '12px 16px', fontSize: '14px' }}>{cat.name}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', fontWeight: '600' }}>{cat.question_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
