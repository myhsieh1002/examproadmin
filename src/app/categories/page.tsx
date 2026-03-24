'use client'
import { useEffect, useState } from 'react'
import { useCurrentApp } from '@/hooks/useCurrentApp'
import type { Category } from '@/lib/types'

export default function CategoriesPage() {
  const { currentApp } = useCurrentApp()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', icon: '', sort_order: 0 })
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', icon: '', sort_order: 0 })
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string; count: number } | null>(null)

  const appLabels: Record<string, string> = {
    npexam: '專科護理師',
    nurseexam: '護理師國考',
    surgeonexam: '外科專科醫師',
  }

  const loadCategories = async () => {
    setLoading(true)
    const res = await fetch(`/api/questions?action=categories&app_id=${currentApp}`)
    if (res.ok) setCategories(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    loadCategories()
    setEditingId(null)
    setShowAdd(false)
  }, [currentApp])

  const handleAdd = async () => {
    if (!addForm.name) return alert('Please enter a category name')
    setSaving(true)
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: currentApp, ...addForm }),
    })
    if (res.ok) {
      setShowAdd(false)
      setAddForm({ name: '', icon: '', sort_order: 0 })
      await loadCategories()
    } else {
      const err = await res.json()
      alert(`Error: ${err.error}`)
    }
    setSaving(false)
  }

  const handleEdit = (cat: Category) => {
    setEditingId(cat.id)
    setEditForm({ name: cat.name, icon: cat.icon || '', sort_order: cat.sort_order })
  }

  const handleSave = async () => {
    if (!editingId || !editForm.name) return
    setSaving(true)
    const res = await fetch(`/api/categories/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    if (res.ok) {
      setEditingId(null)
      await loadCategories()
    } else {
      const err = await res.json()
      alert(`Error: ${err.error}`)
    }
    setSaving(false)
  }

  const handleDeleteClick = (cat: Category) => {
    setDeleteConfirm({ id: cat.id, name: cat.name, count: cat.question_count })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return
    setSaving(true)
    const force = deleteConfirm.count > 0 ? '?force=true' : ''
    const res = await fetch(`/api/categories/${deleteConfirm.id}${force}`, { method: 'DELETE' })
    if (res.ok) {
      setDeleteConfirm(null)
      await loadCategories()
    } else {
      const err = await res.json()
      alert(`Error: ${err.error}`)
    }
    setSaving(false)
  }

  const handleCreateFromOrphan = async (name: string) => {
    setSaving(true)
    const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), 0)
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: currentApp, name, sort_order: maxOrder + 1 }),
    })
    if (res.ok) {
      await loadCategories()
    } else {
      const err = await res.json()
      alert(`Error: ${err.error}`)
    }
    setSaving(false)
  }

  const inputStyle = {
    padding: '6px 10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
  }

  const btnStyle = (bg: string, color = 'white') => ({
    padding: '6px 12px',
    backgroundColor: bg,
    color,
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: saving ? 'not-allowed' as const : 'pointer' as const,
    opacity: saving ? 0.7 : 1,
  })

  if (loading) return <p>Loading...</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Categories</h2>
        <button onClick={() => setShowAdd(!showAdd)} style={btnStyle('#0f3460')}>
          {showAdd ? 'Cancel' : '+ Add Category'}
        </button>
      </div>
      <p style={{ color: '#666', marginBottom: '24px' }}>{appLabels[currentApp]}</p>

      {/* Add form */}
      {showAdd && (
        <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #eee', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', flex: 1 }}>
            Name
            <input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              placeholder="Category name" style={{ ...inputStyle, width: '100%', marginTop: '4px', display: 'block' }} />
          </label>
          <label style={{ fontSize: '13px', fontWeight: '600', width: '180px' }}>
            Icon (SF Symbol)
            <input value={addForm.icon} onChange={(e) => setAddForm({ ...addForm, icon: e.target.value })}
              placeholder="e.g., book.fill" style={{ ...inputStyle, width: '100%', marginTop: '4px', display: 'block' }} />
          </label>
          <label style={{ fontSize: '13px', fontWeight: '600', width: '80px' }}>
            Order
            <input type="number" value={addForm.sort_order} onChange={(e) => setAddForm({ ...addForm, sort_order: parseInt(e.target.value) || 0 })}
              style={{ ...inputStyle, width: '100%', marginTop: '4px', display: 'block' }} />
          </label>
          <button onClick={handleAdd} disabled={saving} style={btnStyle('#28a745')}>Add</button>
        </div>
      )}

      {/* Categories table */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', border: '1px solid #eee' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666', width: '50px' }}>#</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666' }}>Name</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666', width: '150px' }}>Icon</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', color: '#666', width: '100px' }}>Questions</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', color: '#666', width: '150px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => {
              const isOrphan = (cat as Category & { _isOrphan?: boolean })._isOrphan
              const isEditing = editingId === cat.id

              return (
                <tr key={cat.id} style={{
                  borderTop: '1px solid #f0f0f0',
                  backgroundColor: isOrphan ? '#fff8e1' : 'transparent',
                }}>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#999' }}>
                    {isEditing ? (
                      <input type="number" value={editForm.sort_order}
                        onChange={(e) => setEditForm({ ...editForm, sort_order: parseInt(e.target.value) || 0 })}
                        style={{ ...inputStyle, width: '50px' }} />
                    ) : cat.sort_order}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                    {isEditing ? (
                      <input value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        style={{ ...inputStyle, width: '100%' }} />
                    ) : (
                      <>
                        {cat.name}
                        {isOrphan && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#e65100', backgroundColor: '#fff3e0', padding: '2px 6px', borderRadius: '4px' }}>未建立類別</span>}
                      </>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: 'monospace', color: '#666' }}>
                    {isEditing ? (
                      <input value={editForm.icon}
                        onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                        placeholder="SF Symbol name"
                        style={{ ...inputStyle, width: '100%' }} />
                    ) : (cat.icon || '-')}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', fontWeight: '600' }}>
                    {cat.question_count}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button onClick={handleSave} disabled={saving} style={btnStyle('#28a745')}>Save</button>
                        <button onClick={() => setEditingId(null)} style={btnStyle('#6c757d')}>Cancel</button>
                      </div>
                    ) : isOrphan ? (
                      <button onClick={() => handleCreateFromOrphan(cat.name)} disabled={saving}
                        style={btnStyle('#e65100')}>Create Category</button>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button onClick={() => handleEdit(cat)} style={btnStyle('#0f3460')}>Edit</button>
                        <button onClick={() => handleDeleteClick(cat)} style={btnStyle('#dc3545')}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', maxWidth: '400px', width: '90%' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>Delete Category</h3>
            <p style={{ fontSize: '14px', marginBottom: '8px' }}>
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
            </p>
            {deleteConfirm.count > 0 && (
              <p style={{ fontSize: '14px', color: '#dc3545', marginBottom: '16px' }}>
                Warning: This category has {deleteConfirm.count} question(s). Questions will not be deleted but will become orphaned.
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)} style={btnStyle('#6c757d')}>Cancel</button>
              <button onClick={handleDeleteConfirm} disabled={saving} style={btnStyle('#dc3545')}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
