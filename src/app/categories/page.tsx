'use client'
import { useEffect, useState } from 'react'
import { useCurrentApp } from '@/hooks/useCurrentApp'
import type { Category } from '@/lib/types'

export default function CategoriesPage() {
  const { currentApp } = useCurrentApp()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch(`/api/questions?action=categories&app_id=${currentApp}`)
      if (res.ok) setCategories(await res.json())
      setLoading(false)
    }
    load()
  }, [currentApp])

  const appLabels: Record<string, string> = {
    npexam: '專科護理師',
    nurseexam: '護理師國考',
    surgeonexam: '外科專科醫師',
  }

  if (loading) return <p>Loading...</p>

  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>Categories</h2>
      <p style={{ color: '#666', marginBottom: '24px' }}>{appLabels[currentApp]}</p>

      <div style={{ backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', border: '1px solid #eee' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666', width: '40px' }}>#</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666' }}>Name</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666', width: '120px' }}>Icon</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', color: '#666', width: '120px' }}>Questions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => (
              <tr key={cat.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={{ padding: '12px 16px', fontSize: '14px', color: '#999' }}>{cat.sort_order}</td>
                <td style={{ padding: '12px 16px', fontSize: '14px' }}>{cat.name}</td>
                <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: 'monospace', color: '#666' }}>{cat.icon}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', fontWeight: '600' }}>{cat.question_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#fff3cd', borderRadius: '8px', fontSize: '14px' }}>
        Category editing coming soon. Currently managed via Supabase SQL Editor.
      </div>
    </div>
  )
}
