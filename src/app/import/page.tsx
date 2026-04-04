'use client'
import { useState, useEffect } from 'react'
import { useCurrentApp } from '@/hooks/useCurrentApp'
import type { Category } from '@/lib/types'

export default function ImportExportPage() {
  const { currentApp, userRole } = useCurrentApp()
  const isSuperAdmin = userRole === 'super_admin'
  const [tab, setTab] = useState<'import' | 'export'>('import')
  const [categories, setCategories] = useState<Category[]>([])

  // Import state
  const [files, setFiles] = useState<File[]>([])
  const [preview, setPreview] = useState<{ fileName: string; count: number; categories: string[] }[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ processed: number; errors: number } | null>(null)

  // Export state
  const [exportCategory, setExportCategory] = useState('')
  const [exportFormat, setExportFormat] = useState('json')
  const [includeExplanation, setIncludeExplanation] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    fetch(`/api/questions?action=categories&app_id=${currentApp}`)
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {})
    setExportCategory('')
  }, [currentApp])

  // --- Import handlers ---
  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    setFiles(selectedFiles)
    setImportResult(null)

    const previews = []
    for (const file of selectedFiles) {
      const text = await file.text()
      const questions = JSON.parse(text)
      const cats = [...new Set(questions.map((q: any) => q.category))] as string[]
      previews.push({ fileName: file.name, count: questions.length, categories: cats })
    }
    setPreview(previews)
  }

  const handleImport = async () => {
    setImporting(true)
    setImportResult(null)

    let totalProcessed = 0
    let totalErrors = 0

    for (const file of files) {
      const text = await file.text()
      const questions = JSON.parse(text)

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: currentApp, questions }),
      })

      const data = await res.json()
      totalProcessed += data.processed || 0
      totalErrors += data.errors || 0
    }

    setImportResult({ processed: totalProcessed, errors: totalErrors })
    setImporting(false)
  }

  // --- Export handler ---
  const handleExport = async () => {
    setExporting(true)
    const params = new URLSearchParams({
      app_id: currentApp,
      format: exportFormat,
      explanation: includeExplanation.toString(),
    })
    if (exportCategory) params.set('category', exportCategory)

    try {
      const res = await fetch(`/api/export?${params}`)
      if (!res.ok) {
        alert('Export failed')
        setExporting(false)
        return
      }

      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const fileNameMatch = disposition.match(/filename="(.+)"/)
      const fileName = fileNameMatch ? fileNameMatch[1] : `export.${exportFormat}`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      alert('Export failed')
    }
    setExporting(false)
  }

  const tabStyle = (active: boolean) => ({
    padding: '10px 24px',
    fontSize: '15px',
    fontWeight: active ? '600' as const : 'normal' as const,
    color: active ? '#0f3460' : '#666',
    borderBottom: active ? '2px solid #0f3460' : '2px solid transparent',
    background: 'none',
    border: 'none',
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid' as const,
    borderBottomColor: active ? '#0f3460' : 'transparent',
    cursor: 'pointer',
  })

  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>Import / Export</h2>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #eee', marginBottom: '24px' }}>
        <button onClick={() => setTab('import')} style={tabStyle(tab === 'import')}>Import</button>
        {isSuperAdmin && (
          <button onClick={() => setTab('export')} style={tabStyle(tab === 'export')}>Export</button>
        )}
      </div>

      {/* ===== IMPORT TAB ===== */}
      {tab === 'import' && (
        <div>
          <p style={{ color: '#666', marginBottom: '24px', fontSize: '14px' }}>
            Import questions from JSON files into <strong>{currentApp}</strong>
          </p>

          <div style={{
            backgroundColor: 'white', border: '2px dashed #ddd', borderRadius: '12px',
            padding: '40px', textAlign: 'center', marginBottom: '24px',
          }}>
            <input type="file" accept=".json" multiple onChange={handleFiles} style={{ display: 'none' }} id="file-upload" />
            <label htmlFor="file-upload" style={{ cursor: 'pointer', fontSize: '16px', color: '#0f3460', textDecoration: 'underline' }}>
              Click to select JSON files
            </label>
            <p style={{ color: '#999', marginTop: '8px', fontSize: '14px' }}>Supports the existing QuestionBank JSON format</p>
          </div>

          {preview.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Preview</h3>
              {preview.map((p, i) => (
                <div key={i} style={{ backgroundColor: 'white', border: '1px solid #eee', borderRadius: '8px', padding: '16px', marginBottom: '8px' }}>
                  <p><strong>{p.fileName}</strong> - {p.count} questions</p>
                  <p style={{ fontSize: '12px', color: '#666' }}>Categories: {p.categories.join(', ')}</p>
                </div>
              ))}
              <button onClick={handleImport} disabled={importing} style={{
                marginTop: '16px', padding: '12px 24px', backgroundColor: '#0f3460', color: 'white',
                border: 'none', borderRadius: '8px', fontSize: '16px',
                cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.7 : 1,
              }}>
                {importing ? 'Importing...' : `Import ${preview.reduce((a, p) => a + p.count, 0)} questions`}
              </button>
            </div>
          )}

          {importResult && (
            <div style={{
              backgroundColor: importResult.errors > 0 ? '#fff3cd' : '#d4edda',
              border: `1px solid ${importResult.errors > 0 ? '#ffc107' : '#28a745'}`,
              borderRadius: '8px', padding: '16px',
            }}>
              <p><strong>Import complete!</strong></p>
              <p>Processed: {importResult.processed} | Errors: {importResult.errors}</p>
            </div>
          )}
        </div>
      )}

      {/* ===== EXPORT TAB ===== */}
      {tab === 'export' && (
        <div>
          <p style={{ color: '#666', marginBottom: '24px', fontSize: '14px' }}>
            Export questions from <strong>{currentApp}</strong>
          </p>

          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #eee' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              {/* Category */}
              <label style={{ fontSize: '14px', fontWeight: '600' }}>
                Category
                <select
                  value={exportCategory}
                  onChange={(e) => setExportCategory(e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px' }}
                >
                  <option value="">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name} ({c.question_count})</option>
                  ))}
                </select>
              </label>

              {/* Format */}
              <label style={{ fontSize: '14px', fontWeight: '600' }}>
                Format
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px' }}
                >
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                </select>
              </label>
            </div>

            {/* Include explanation */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', marginBottom: '20px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeExplanation}
                onChange={(e) => setIncludeExplanation(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              Include explanations (decrypted)
            </label>

            {/* Export button */}
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{
                padding: '12px 24px', backgroundColor: exporting ? '#ccc' : '#0f3460', color: 'white',
                border: 'none', borderRadius: '8px', fontSize: '15px',
                cursor: exporting ? 'not-allowed' : 'pointer',
              }}
            >
              {exporting ? 'Exporting...' : 'Download Export'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
