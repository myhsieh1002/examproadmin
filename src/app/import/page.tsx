'use client'
import { useState } from 'react'
import { useCurrentApp } from '@/hooks/useCurrentApp'

export default function ImportPage() {
  const { currentApp } = useCurrentApp()
  const [files, setFiles] = useState<File[]>([])
  const [preview, setPreview] = useState<{ fileName: string; count: number; categories: string[] }[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ processed: number; errors: number } | null>(null)

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    setFiles(selectedFiles)
    setResult(null)

    const previews = []
    for (const file of selectedFiles) {
      const text = await file.text()
      const questions = JSON.parse(text)
      const categories = [...new Set(questions.map((q: any) => q.category))] as string[]
      previews.push({ fileName: file.name, count: questions.length, categories })
    }
    setPreview(previews)
  }

  const handleImport = async () => {
    setImporting(true)
    setResult(null)

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

    setResult({ processed: totalProcessed, errors: totalErrors })
    setImporting(false)
  }

  const appLabels: Record<string, string> = {
    npexam: '專科護理師',
    nurseexam: '護理師國考',
    surgeonexam: '外科專科醫師',
    mdexam1: '醫師第一階段國考',
  }

  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>Import Questions</h2>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        Importing to: <strong>{appLabels[currentApp]}</strong>
      </p>

      {/* File Upload */}
      <div style={{
        backgroundColor: 'white',
        border: '2px dashed #ddd',
        borderRadius: '12px',
        padding: '40px',
        textAlign: 'center',
        marginBottom: '24px',
      }}>
        <input
          type="file"
          accept=".json"
          multiple
          onChange={handleFiles}
          style={{ display: 'none' }}
          id="file-upload"
        />
        <label htmlFor="file-upload" style={{
          cursor: 'pointer',
          fontSize: '16px',
          color: '#0f3460',
          textDecoration: 'underline',
        }}>
          Click to select JSON files
        </label>
        <p style={{ color: '#999', marginTop: '8px', fontSize: '14px' }}>
          Supports the existing QuestionBank JSON format
        </p>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Preview</h3>
          {preview.map((p, i) => (
            <div key={i} style={{
              backgroundColor: 'white',
              border: '1px solid #eee',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '8px',
            }}>
              <p><strong>{p.fileName}</strong> - {p.count} questions</p>
              <p style={{ fontSize: '12px', color: '#666' }}>Categories: {p.categories.join(', ')}</p>
            </div>
          ))}
          <div style={{ marginTop: '16px' }}>
            <button
              onClick={handleImport}
              disabled={importing}
              style={{
                padding: '12px 24px',
                backgroundColor: '#0f3460',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                cursor: importing ? 'not-allowed' : 'pointer',
                opacity: importing ? 0.7 : 1,
              }}
            >
              {importing ? 'Importing...' : `Import ${preview.reduce((a, p) => a + p.count, 0)} questions`}
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{
          backgroundColor: result.errors > 0 ? '#fff3cd' : '#d4edda',
          border: `1px solid ${result.errors > 0 ? '#ffc107' : '#28a745'}`,
          borderRadius: '8px',
          padding: '16px',
        }}>
          <p><strong>Import complete!</strong></p>
          <p>Processed: {result.processed} | Errors: {result.errors}</p>
        </div>
      )}
    </div>
  )
}
