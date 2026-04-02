'use client'
import { useEffect, useState } from 'react'
import { useCurrentApp } from '@/hooks/useCurrentApp'
import type { AdminUser } from '@/lib/types'

const ROLES = ['super_admin', 'admin', 'editor'] as const

export default function UsersPage() {
  const { userRole } = useCurrentApp()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [appOptions, setAppOptions] = useState<{ id: string; label: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', display_name: '', role: 'editor' as string, allowed_apps: [] as string[], allowed_categories: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ display_name: '', role: '', allowed_apps: [] as string[], allowed_categories: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const loadUsers = async () => {
    setLoading(true)
    const res = await fetch('/api/users')
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }

  // Load apps dynamically
  useEffect(() => {
    fetch('/api/questions?action=apps')
      .then(r => r.ok ? r.json() : [])
      .then((apps: { id: string; display_name: string }[]) => {
        setAppOptions(apps.map(a => ({ id: a.id, label: a.display_name })))
      })
      .catch(() => {})
  }, [])

  useEffect(() => { loadUsers() }, [])

  if (userRole !== 'super_admin') {
    return <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>Access Denied</h2>
      <p>Only super admins can manage users.</p>
    </div>
  }

  const handleInvite = async () => {
    if (!inviteForm.email) return alert('Please enter an email')
    setSaving(true)
    setMessage('')
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...inviteForm,
        allowed_categories: inviteForm.allowed_categories ? inviteForm.allowed_categories.split(',').map(s => s.trim()) : [],
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setShowInvite(false)
      setInviteForm({ email: '', display_name: '', role: 'editor', allowed_apps: [], allowed_categories: '' })
      setMessage(`Invitation email sent to ${inviteForm.email}. User can set password via the link in the email.`)
      await loadUsers()
    } else {
      alert(`Error: ${data.error}`)
    }
    setSaving(false)
  }

  const handleEdit = (user: AdminUser) => {
    setEditingId(user.id)
    setEditForm({
      display_name: user.display_name || '',
      role: user.role,
      allowed_apps: user.allowed_apps || [],
      allowed_categories: (user.allowed_categories || []).join(', '),
    })
  }

  const handleSave = async () => {
    if (!editingId) return
    setSaving(true)
    const res = await fetch(`/api/users/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editForm,
        allowed_categories: editForm.allowed_categories ? editForm.allowed_categories.split(',').map(s => s.trim()) : [],
      }),
    })
    if (res.ok) {
      setEditingId(null)
      await loadUsers()
    } else {
      const err = await res.json()
      alert(`Error: ${err.error}`)
    }
    setSaving(false)
  }

  const handleDelete = async (user: AdminUser) => {
    if (!confirm(`Permanently remove user ${user.email}? This will delete their account and allow re-invitation.`)) return
    setSaving(true)
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
    if (res.ok) {
      setMessage(`User ${user.email} has been removed.`)
      await loadUsers()
    } else {
      const err = await res.json()
      alert(`Error: ${err.error}`)
    }
    setSaving(false)
  }

  const toggleApp = (apps: string[], appId: string) => {
    return apps.includes(appId) ? apps.filter(a => a !== appId) : [...apps, appId]
  }

  const inputStyle = { padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' }
  const btnStyle = (bg: string) => ({
    padding: '6px 12px', backgroundColor: bg, color: 'white', border: 'none', borderRadius: '6px',
    fontSize: '13px', cursor: saving ? 'not-allowed' as const : 'pointer' as const, opacity: saving ? 0.7 : 1,
  })

  if (loading) return <p>Loading...</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>User Management</h2>
        <button onClick={() => setShowInvite(!showInvite)} style={btnStyle('#0f3460')}>
          {showInvite ? 'Cancel' : '+ Invite User'}
        </button>
      </div>

      {message && (
        <div style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', backgroundColor: '#d4edda', color: '#155724', fontSize: '14px', wordBreak: 'break-all' }}>
          {message}
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Invite New User</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label style={{ fontSize: '13px', fontWeight: '600' }}>
              Email *
              <input value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                placeholder="user@example.com" style={{ ...inputStyle, width: '100%', marginTop: '4px', display: 'block' }} />
            </label>
            <label style={{ fontSize: '13px', fontWeight: '600' }}>
              Display Name
              <input value={inviteForm.display_name} onChange={(e) => setInviteForm({ ...inviteForm, display_name: e.target.value })}
                style={{ ...inputStyle, width: '100%', marginTop: '4px', display: 'block' }} />
            </label>
            <label style={{ fontSize: '13px', fontWeight: '600' }}>
              Role
              <select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                style={{ ...inputStyle, width: '100%', marginTop: '4px', display: 'block' }}>
                {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
              </select>
            </label>
            <div style={{ fontSize: '13px', fontWeight: '600' }}>
              Allowed Apps
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                {appOptions.map(app => (
                  <label key={app.id} style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={inviteForm.allowed_apps.includes(app.id)}
                      onChange={() => setInviteForm({ ...inviteForm, allowed_apps: toggleApp(inviteForm.allowed_apps, app.id) })} />
                    {app.label}
                  </label>
                ))}
              </div>
            </div>
            <label style={{ fontSize: '13px', fontWeight: '600', gridColumn: '1 / -1' }}>
              Allowed Categories (comma-separated, leave empty for all)
              <input value={inviteForm.allowed_categories} onChange={(e) => setInviteForm({ ...inviteForm, allowed_categories: e.target.value })}
                placeholder="e.g., 一般外科, 肝膽胰外科" style={{ ...inputStyle, width: '100%', marginTop: '4px', display: 'block' }} />
            </label>
          </div>
          <button onClick={handleInvite} disabled={saving} style={{ ...btnStyle('#28a745'), marginTop: '12px' }}>Send Invite</button>
        </div>
      )}

      {/* Users table */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', border: '1px solid #eee' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666' }}>Email</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666' }}>Name</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666', width: '120px' }}>Role</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666' }}>Allowed Apps</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666' }}>Allowed Categories</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', color: '#666', width: '150px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => {
              const isEditing = editingId === user.id
              return (
                <tr key={user.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{user.email}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                    {isEditing ? (
                      <input value={editForm.display_name} onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                        style={{ ...inputStyle, width: '100%' }} />
                    ) : (user.display_name || '-')}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                    {isEditing ? (
                      <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                        style={{ ...inputStyle, width: '100%' }}>
                        {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                      </select>
                    ) : (
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '12px',
                        backgroundColor: user.role === 'super_admin' ? '#e3f2fd' : user.role === 'admin' ? '#e8f5e9' : '#fff3e0',
                        color: user.role === 'super_admin' ? '#1565c0' : user.role === 'admin' ? '#2e7d32' : '#e65100',
                      }}>
                        {user.role.replace('_', ' ')}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {appOptions.map(app => (
                          <label key={app.id} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={editForm.allowed_apps.includes(app.id)}
                              onChange={() => setEditForm({ ...editForm, allowed_apps: toggleApp(editForm.allowed_apps, app.id) })} />
                            {app.label}
                          </label>
                        ))}
                      </div>
                    ) : (
                      (user.allowed_apps?.length ? user.allowed_apps.map(a => appOptions.find(o => o.id === a)?.label || a).join(', ') : 'All')
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                    {isEditing ? (
                      <input value={editForm.allowed_categories} onChange={(e) => setEditForm({ ...editForm, allowed_categories: e.target.value })}
                        placeholder="All" style={{ ...inputStyle, width: '100%' }} />
                    ) : (
                      (user.allowed_categories?.length ? user.allowed_categories.join(', ') : 'All')
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button onClick={handleSave} disabled={saving} style={btnStyle('#28a745')}>Save</button>
                        <button onClick={() => setEditingId(null)} style={btnStyle('#6c757d')}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button onClick={() => handleEdit(user)} style={btnStyle('#0f3460')}>Edit</button>
                        <button onClick={() => handleDelete(user)} style={btnStyle('#dc3545')}>Remove</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Permissions Reference Table */}
      <div style={{ marginTop: '40px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Role Permissions Reference</h3>
        <div style={{ backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', border: '1px solid #eee' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666' }}>Feature</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '13px', color: '#1565c0' }}>Super Admin</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '13px', color: '#2e7d32' }}>Admin</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '13px', color: '#e65100' }}>Editor</th>
              </tr>
            </thead>
            <tbody>
              {[
                { feature: 'Dashboard', super_admin: true, admin: true, editor: true },
                { feature: 'View Questions', super_admin: true, admin: true, editor: true },
                { feature: 'Create / Edit Questions', super_admin: true, admin: true, editor: true },
                { feature: 'Delete Questions', super_admin: true, admin: true, editor: false },
                { feature: 'AI Generate Explanations', super_admin: true, admin: true, editor: true },
                { feature: 'Batch AI Generate', super_admin: true, admin: true, editor: false },
                { feature: 'Import Questions (JSON)', super_admin: true, admin: true, editor: false },
                { feature: 'Manage Categories', super_admin: true, admin: true, editor: false },
                { feature: 'Upload / Manage Images', super_admin: true, admin: true, editor: true },
                { feature: 'View / Respond to Feedback', super_admin: true, admin: true, editor: false },
                { feature: 'User Management', super_admin: true, admin: false, editor: false },
                { feature: 'Access All Apps', super_admin: true, admin: false, editor: false },
                { feature: 'Restricted to Allowed Apps', super_admin: false, admin: true, editor: true },
                { feature: 'Restricted to Allowed Categories', super_admin: false, admin: false, editor: true },
              ].map((row, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 16px', fontSize: '14px' }}>{row.feature}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: '16px' }}>{row.super_admin ? '✅' : '—'}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: '16px' }}>{row.admin ? '✅' : '—'}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: '16px' }}>{row.editor ? '✅' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
