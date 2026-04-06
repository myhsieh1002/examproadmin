'use client'
import { useEffect, useState } from 'react'
import { useCurrentApp } from '@/hooks/useCurrentApp'

interface UsageData {
  plan: string
  limits: { egress_gb: number; db_mb: number; storage_gb: number; mau: number; label: string }
  billing_cycle: { start: string; end: string }
  database: { size_bytes: number | null; tables: { table_name: string; size_bytes: number; row_count: number }[] | null }
  questions: { total: number; with_explanation: number; without_explanation: number; per_app: Record<string, { total: number; withExplanation: number }> }
  apps: { id: string; display_name: string; total_questions: number }[]
}

const EGRESS_PER_BATCH_QUESTION_MB = 0.01 // ~10 KB per batch question
const EGRESS_PER_USER_MB = 5 // ~5 MB per new user first download

export default function UsagePage() {
  const { userRole } = useCurrentApp()
  const [data, setData] = useState<UsageData | null>(null)
  const [egressUsedGB, setEgressUsedGB] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/usage')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (userRole !== 'super_admin') {
    return <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>Access Denied</h2>
      <p>Only super admins can view usage.</p>
    </div>
  }

  if (loading || !data) return <p>Loading...</p>

  const dbSizeMB = data.database.size_bytes ? (data.database.size_bytes / 1024 / 1024) : null
  const dbLimitMB = data.limits.db_mb
  const dbPct = dbSizeMB ? Math.round((dbSizeMB / dbLimitMB) * 100) : null

  const egressGB = egressUsedGB ? parseFloat(egressUsedGB) : null
  const egressLimitGB = data.limits.egress_gb
  const egressPct = egressGB !== null ? Math.round((egressGB / egressLimitGB) * 100) : null
  const egressRemainingGB = egressGB !== null ? egressLimitGB - egressGB : null
  const egressRemainingMB = egressRemainingGB !== null ? egressRemainingGB * 1024 : null

  const estBatchQuestions = egressRemainingMB !== null ? Math.floor(egressRemainingMB / EGRESS_PER_BATCH_QUESTION_MB) : null
  const estNewUsers = egressRemainingMB !== null ? Math.floor(egressRemainingMB / EGRESS_PER_USER_MB) : null

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
    return `${(bytes / 1073741824).toFixed(2)} GB`
  }

  const progressBar = (pct: number, color?: string) => (
    <div style={{ width: '100%', height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
      <div style={{
        width: `${Math.min(pct, 100)}%`, height: '100%',
        backgroundColor: color || (pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#16a34a'),
        borderRadius: '3px', transition: 'width 0.3s',
      }} />
    </div>
  )

  return (
    <div style={{ maxWidth: '900px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>Usage Monitor</h2>
      <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px' }}>
        Plan: <strong>{data.plan}</strong> | Billing cycle: {data.billing_cycle.start} ~ {data.billing_cycle.end}
      </p>

      {/* Egress Input (manual since API not available on Free plan) */}
      <div style={{ backgroundColor: '#fff7ed', padding: '16px', borderRadius: '10px', border: '1px solid #fed7aa', marginBottom: '24px' }}>
        <p style={{ fontSize: '13px', color: '#9a3412', marginBottom: '8px' }}>
          Egress data requires manual input. Check <a href="https://supabase.com/dashboard/org/tedjwzsrpjnnepsmnppo/usage?projectRef=insaqafqbbunziratdxe" target="_blank" rel="noopener" style={{ color: '#0f3460', textDecoration: 'underline' }}>Supabase Dashboard → Usage</a> for current egress.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '600' }}>Current Egress (GB):</label>
          <input
            type="number"
            step="0.01"
            value={egressUsedGB}
            onChange={(e) => setEgressUsedGB(e.target.value)}
            placeholder="e.g. 4.53"
            style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '6px', width: '120px', fontSize: '14px' }}
          />
        </div>
      </div>

      {/* Usage Table */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden', marginBottom: '24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666' }}>Item</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', color: '#666', width: '120px' }}>Used</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', color: '#666', width: '120px' }}>Limit</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', color: '#666', width: '120px' }}>Remaining</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', color: '#666', width: '140px' }}>Est. Batch Q</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', color: '#666', width: '140px' }}>Est. New Users</th>
            </tr>
          </thead>
          <tbody>
            {/* Egress */}
            <tr style={{ borderTop: '1px solid #f0f0f0' }}>
              <td style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>Egress</div>
                {egressPct !== null && progressBar(egressPct)}
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px' }}>
                {egressGB !== null ? `${egressGB} GB` : <span style={{ color: '#999' }}>—</span>}
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px' }}>{egressLimitGB} GB</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', fontWeight: '600', color: egressPct !== null && egressPct > 90 ? '#ef4444' : '#333' }}>
                {egressRemainingGB !== null ? `${egressRemainingGB.toFixed(2)} GB` : '—'}
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', color: '#666' }}>
                {estBatchQuestions !== null ? `~${estBatchQuestions.toLocaleString()}` : '—'}
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', color: '#666' }}>
                {estNewUsers !== null ? `~${estNewUsers.toLocaleString()}` : '—'}
              </td>
            </tr>
            {/* Database */}
            <tr style={{ borderTop: '1px solid #f0f0f0' }}>
              <td style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>Database Size</div>
                {dbPct !== null && progressBar(dbPct)}
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px' }}>
                {dbSizeMB !== null ? `${dbSizeMB.toFixed(1)} MB` : '—'}
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px' }}>{dbLimitMB} MB</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', fontWeight: '600' }}>
                {dbSizeMB !== null ? `${(dbLimitMB - dbSizeMB).toFixed(1)} MB` : '—'}
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', color: '#999' }}>—</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', color: '#999' }}>—</td>
            </tr>
            {/* Storage */}
            <tr style={{ borderTop: '1px solid #f0f0f0' }}>
              <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '600' }}>Storage</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px' }}>0 GB</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px' }}>{data.limits.storage_gb} GB</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', fontWeight: '600' }}>{data.limits.storage_gb} GB</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', color: '#999' }}>—</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', color: '#999' }}>—</td>
            </tr>
            {/* MAU */}
            <tr style={{ borderTop: '1px solid #f0f0f0' }}>
              <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '600' }}>Monthly Active Users</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px' }}>8</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px' }}>{data.limits.mau.toLocaleString()}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', fontWeight: '600' }}>Sufficient</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', color: '#999' }}>—</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', color: '#999' }}>—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Question Stats */}
      <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>Question Stats</h3>
      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: '24px' }}>
          <span style={{ fontSize: '14px' }}>Total: <strong>{data.questions.total.toLocaleString()}</strong></span>
          <span style={{ fontSize: '14px', color: '#16a34a' }}>With Explanation: <strong>{data.questions.with_explanation.toLocaleString()}</strong></span>
          <span style={{ fontSize: '14px', color: '#ef4444' }}>Without: <strong>{data.questions.without_explanation.toLocaleString()}</strong></span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '13px', color: '#666' }}>App</th>
              <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '13px', color: '#666' }}>Total</th>
              <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '13px', color: '#666' }}>Explanations</th>
              <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '13px', color: '#666' }}>Progress</th>
            </tr>
          </thead>
          <tbody>
            {data.apps.map(app => {
              const s = data.questions.per_app[app.id] || { total: 0, withExplanation: 0 }
              const pct = s.total > 0 ? Math.round((s.withExplanation / s.total) * 100) : 0
              return (
                <tr key={app.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 16px', fontSize: '14px' }}>{app.display_name}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '14px' }}>{s.total.toLocaleString()}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '14px' }}>{s.withExplanation.toLocaleString()}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', width: '180px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                      <span style={{ fontSize: '13px', color: pct === 100 ? '#16a34a' : '#666' }}>{pct}%</span>
                      <div style={{ width: '80px' }}>{progressBar(pct)}</div>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* DB Table Sizes */}
      {data.database.tables && (
        <>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>Database Tables</h3>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '13px', color: '#666' }}>Table</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '13px', color: '#666' }}>Rows</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '13px', color: '#666' }}>Size</th>
                </tr>
              </thead>
              <tbody>
                {data.database.tables.map((t, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '10px 16px', fontSize: '14px', fontFamily: 'monospace' }}>{t.table_name}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '14px' }}>{t.row_count?.toLocaleString()}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '14px' }}>{formatBytes(t.size_bytes)}</td>
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
