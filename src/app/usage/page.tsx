'use client'
import { useEffect, useState } from 'react'
import { useCurrentApp } from '@/hooks/useCurrentApp'

interface PlanLimits {
  egress_gb: number
  db_mb: number
  storage_gb: number
  mau: number
  label: string
  price: string
}

interface ApiCounts {
  interval: string
  totalRequests: number
  estimatedEgressMB: number
  breakdown: { rest: number; auth: number; storage: number; realtime: number }
}

interface UsageData {
  plan: string
  current_plan_key: string
  limits: PlanLimits
  all_plans: Record<string, PlanLimits>
  billing_cycle: { start: string; end: string }
  database: { size_bytes: number | null; tables: { table_name: string; size_bytes: number; row_count: number }[] | null }
  api_counts: ApiCounts | null
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

  // Check if current usage fits within Free plan limits
  const freePlan = data.all_plans?.free
  const canDowngradeEgress = egressGB !== null && freePlan ? egressGB < freePlan.egress_gb : null
  const canDowngradeDB = dbSizeMB !== null && freePlan ? dbSizeMB < freePlan.db_mb : null

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
    <div style={{ maxWidth: '960px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>Usage Monitor</h2>
      <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px' }}>
        Current Plan: <strong style={{ color: '#0f3460' }}>{data.plan}</strong> ({data.all_plans?.[data.current_plan_key]?.price}) | Billing cycle: {data.billing_cycle.start} ~ {data.billing_cycle.end}
      </p>

      {/* API Request Stats (auto-fetched) */}
      {data.api_counts && (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden', marginBottom: '24px' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', backgroundColor: '#f0f9ff' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', margin: 0 }}>
              API Requests (Last 7 Days)
              <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666', marginLeft: '8px' }}>auto-fetched from Supabase</span>
            </h3>
          </div>
          <div style={{ padding: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f3460' }}>
                {data.api_counts.totalRequests.toLocaleString()}
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>Total Requests</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#16a34a' }}>
                ~{data.api_counts.estimatedEgressMB < 1024
                  ? `${data.api_counts.estimatedEgressMB} MB`
                  : `${(data.api_counts.estimatedEgressMB / 1024).toFixed(2)} GB`}
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>Est. Egress (7 days)</div>
            </div>
            <div style={{ borderLeft: '1px solid #eee', paddingLeft: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {Object.entries(data.api_counts.breakdown).map(([type, count]) => (
                <div key={type} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '16px', fontWeight: '600' }}>{count.toLocaleString()}</div>
                  <div style={{ fontSize: '11px', color: '#999', textTransform: 'capitalize' }}>{type}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: '8px 16px', borderTop: '1px solid #f0f0f0', fontSize: '12px', color: '#999', backgroundColor: '#fafafa' }}>
            Estimated egress = requests x avg response size. For accurate egress, check{' '}
            <a href="https://supabase.com/dashboard/org/tedjwzsrpjnnepsmnppo/usage?projectRef=insaqafqbbunziratdxe" target="_blank" rel="noopener" style={{ color: '#0f3460', textDecoration: 'underline' }}>
              Supabase Dashboard
            </a>
          </div>
        </div>
      )}

      {/* Plan Comparison Table */}
      {data.all_plans && (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden', marginBottom: '24px' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', backgroundColor: '#f9f9f9' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', margin: 0 }}>Plan Comparison</h3>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#fafafa' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '13px', color: '#666' }}>Item</th>
                {Object.entries(data.all_plans).map(([key, p]) => (
                  <th key={key} style={{
                    padding: '10px 16px', textAlign: 'center', fontSize: '13px',
                    color: key === data.current_plan_key ? '#0f3460' : '#666',
                    backgroundColor: key === data.current_plan_key ? '#eff6ff' : 'transparent',
                  }}>
                    {p.label} {key === data.current_plan_key && <span style={{ fontSize: '11px' }}>(current)</span>}
                    <div style={{ fontSize: '11px', fontWeight: 'normal', color: '#999', marginTop: '2px' }}>
                      {p.price}
                    </div>
                  </th>
                ))}
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: '13px', color: '#666' }}>
                  Current Usage
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: '13px', color: '#666', width: '100px' }}>
                  Free Fit?
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Egress */}
              <tr style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={{ padding: '10px 16px', fontSize: '14px', fontWeight: '500' }}>Egress</td>
                {Object.entries(data.all_plans).map(([key, p]) => (
                  <td key={key} style={{
                    padding: '10px 16px', textAlign: 'center', fontSize: '14px',
                    backgroundColor: key === data.current_plan_key ? '#eff6ff' : 'transparent',
                  }}>
                    {p.egress_gb} GB
                  </td>
                ))}
                <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: '14px' }}>
                  {egressGB !== null ? `${egressGB} GB` : <span style={{ color: '#999' }}>input below</span>}
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: '14px' }}>
                  {canDowngradeEgress === null ? <span style={{ color: '#999' }}>—</span> :
                    canDowngradeEgress ?
                      <span style={{ color: '#16a34a', fontWeight: '600' }}>OK</span> :
                      <span style={{ color: '#ef4444', fontWeight: '600' }}>OVER</span>
                  }
                </td>
              </tr>
              {/* Database */}
              <tr style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={{ padding: '10px 16px', fontSize: '14px', fontWeight: '500' }}>Database</td>
                {Object.entries(data.all_plans).map(([key, p]) => (
                  <td key={key} style={{
                    padding: '10px 16px', textAlign: 'center', fontSize: '14px',
                    backgroundColor: key === data.current_plan_key ? '#eff6ff' : 'transparent',
                  }}>
                    {p.db_mb >= 1024 ? `${(p.db_mb / 1024).toFixed(0)} GB` : `${p.db_mb} MB`}
                  </td>
                ))}
                <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: '14px' }}>
                  {dbSizeMB !== null ? `${dbSizeMB.toFixed(1)} MB` : <span style={{ color: '#999' }}>—</span>}
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: '14px' }}>
                  {canDowngradeDB === null ? <span style={{ color: '#999' }}>—</span> :
                    canDowngradeDB ?
                      <span style={{ color: '#16a34a', fontWeight: '600' }}>OK</span> :
                      <span style={{ color: '#ef4444', fontWeight: '600' }}>OVER</span>
                  }
                </td>
              </tr>
              {/* Storage */}
              <tr style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={{ padding: '10px 16px', fontSize: '14px', fontWeight: '500' }}>Storage</td>
                {Object.entries(data.all_plans).map(([key, p]) => (
                  <td key={key} style={{
                    padding: '10px 16px', textAlign: 'center', fontSize: '14px',
                    backgroundColor: key === data.current_plan_key ? '#eff6ff' : 'transparent',
                  }}>
                    {p.storage_gb} GB
                  </td>
                ))}
                <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: '14px' }}>~0 GB</td>
                <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: '14px' }}>
                  <span style={{ color: '#16a34a', fontWeight: '600' }}>OK</span>
                </td>
              </tr>
              {/* MAU */}
              <tr style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={{ padding: '10px 16px', fontSize: '14px', fontWeight: '500' }}>MAU</td>
                {Object.entries(data.all_plans).map(([key, p]) => (
                  <td key={key} style={{
                    padding: '10px 16px', textAlign: 'center', fontSize: '14px',
                    backgroundColor: key === data.current_plan_key ? '#eff6ff' : 'transparent',
                  }}>
                    {p.mau.toLocaleString()}
                  </td>
                ))}
                <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: '14px' }}>~8</td>
                <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: '14px' }}>
                  <span style={{ color: '#16a34a', fontWeight: '600' }}>OK</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', backgroundColor: '#fefce8', fontSize: '13px', color: '#854d0e' }}>
            <strong>Downgrade Checklist:</strong> All items in &quot;Free Fit?&quot; column must show <span style={{ color: '#16a34a', fontWeight: '600' }}>OK</span> before downgrading.
            Egress resets each billing cycle — check near cycle end to evaluate.
            Database size is cumulative — won&apos;t reset.
          </div>
        </div>
      )}

      {/* Egress Manual Input + Estimation */}
      <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>Egress Calculator</h3>
      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
          <p style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}>
            Enter actual egress from{' '}
            <a href="https://supabase.com/dashboard/org/tedjwzsrpjnnepsmnppo/usage?projectRef=insaqafqbbunziratdxe" target="_blank" rel="noopener" style={{ color: '#0f3460', textDecoration: 'underline' }}>
              Supabase Dashboard → Usage
            </a>{' '}
            to calculate remaining capacity.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', fontWeight: '600' }}>Current Egress (GB):</label>
            <input
              type="number"
              step="0.01"
              value={egressUsedGB}
              onChange={(e) => setEgressUsedGB(e.target.value)}
              placeholder="e.g. 6.2"
              style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '6px', width: '120px', fontSize: '14px' }}
            />
            {egressPct !== null && (
              <span style={{ fontSize: '13px', color: egressPct > 90 ? '#ef4444' : egressPct > 70 ? '#f59e0b' : '#16a34a', fontWeight: '600' }}>
                {egressPct}% used
              </span>
            )}
          </div>
          {egressPct !== null && (
            <div style={{ marginTop: '8px', maxWidth: '300px' }}>
              {progressBar(egressPct)}
            </div>
          )}
        </div>
        {egressGB !== null && (
          <div style={{ padding: '16px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#999', marginBottom: '2px' }}>Remaining</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: egressPct! > 90 ? '#ef4444' : '#333' }}>
                {egressRemainingGB!.toFixed(2)} GB
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#999', marginBottom: '2px' }}>Est. Batch Questions</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f3460' }}>
                ~{estBatchQuestions!.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#999', marginBottom: '2px' }}>Est. New Users</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f3460' }}>
                ~{estNewUsers!.toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Database Usage */}
      <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>Database Usage</h3>
      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '16px', display: 'flex', gap: '32px', flexWrap: 'wrap', borderBottom: data.database.tables ? '1px solid #f0f0f0' : 'none' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#999', marginBottom: '2px' }}>Used</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{dbSizeMB !== null ? `${dbSizeMB.toFixed(1)} MB` : '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#999', marginBottom: '2px' }}>Limit ({data.plan})</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
              {dbLimitMB >= 1024 ? `${(dbLimitMB / 1024).toFixed(0)} GB` : `${dbLimitMB} MB`}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#999', marginBottom: '2px' }}>Remaining</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#16a34a' }}>
              {dbSizeMB !== null ? (
                (dbLimitMB - dbSizeMB) >= 1024
                  ? `${((dbLimitMB - dbSizeMB) / 1024).toFixed(1)} GB`
                  : `${(dbLimitMB - dbSizeMB).toFixed(1)} MB`
              ) : '—'}
            </div>
          </div>
          {dbPct !== null && (
            <div style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1 }}>{progressBar(dbPct)}</div>
              <span style={{ fontSize: '13px', color: '#666' }}>{dbPct}%</span>
            </div>
          )}
        </div>

        {/* Table sizes */}
        {data.database.tables && (
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
        )}
      </div>

      {/* Question Stats */}
      <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>Question Stats</h3>
      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
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
    </div>
  )
}
