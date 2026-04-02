'use client'
import { useEffect, useState, useRef } from 'react'
import { useCurrentApp } from '@/hooks/useCurrentApp'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

interface ImageRecord {
  id: string
  app_id: string
  file_name: string
  storage_path: string
  size_bytes: number
  created_at: string
  public_url: string
}

export default function ImagesPage() {
  const { currentApp } = useCurrentApp()
  const [images, setImages] = useState<ImageRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [message, setMessage] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadImages = async () => {
    setLoading(true)
    const res = await fetch(`/api/images?app_id=${currentApp}`)
    if (res.ok) setImages(await res.json())
    setLoading(false)
  }

  useEffect(() => { loadImages() }, [currentApp])

  const uploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f =>
      ['image/png', 'image/jpeg', 'image/webp'].includes(f.type)
    )
    if (fileArray.length === 0) {
      setMessage('No valid image files selected (PNG/JPG/WEBP only)')
      return
    }

    setUploading(true)
    setUploadProgress({ current: 0, total: fileArray.length })
    setMessage('')
    let success = 0, errors = 0

    for (let i = 0; i < fileArray.length; i++) {
      const formData = new FormData()
      formData.append('file', fileArray[i])
      formData.append('app_id', currentApp)
      try {
        const res = await fetch('/api/images', { method: 'POST', body: formData })
        if (res.ok) success++
        else errors++
      } catch { errors++ }
      setUploadProgress({ current: i + 1, total: fileArray.length })
    }

    setMessage(`Uploaded ${success} images${errors > 0 ? `, ${errors} errors` : ''}`)
    setUploading(false)
    loadImages()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files)
  }

  const handleDelete = async (img: ImageRecord) => {
    if (!confirm(`Delete ${img.file_name}?`)) return
    await fetch('/api/images', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_name: img.file_name, app_id: img.app_id }),
    })
    loadImages()
  }

  const copyFileName = (name: string) => {
    navigator.clipboard.writeText(name)
    setMessage(`Copied: ${name}`)
    setTimeout(() => setMessage(''), 2000)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  return (
    <div style={{ maxWidth: '1000px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>Images ({images.length})</h2>

      {/* Upload Area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#7c3aed' : '#ddd'}`,
          borderRadius: '12px',
          padding: '40px',
          textAlign: 'center',
          backgroundColor: dragOver ? '#f5f0ff' : 'white',
          cursor: uploading ? 'default' : 'pointer',
          marginBottom: '24px',
          transition: 'all 0.2s',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          style={{ display: 'none' }}
        />
        {uploading ? (
          <div>
            <p style={{ fontSize: '16px', marginBottom: '8px' }}>
              Uploading {uploadProgress.current} / {uploadProgress.total}...
            </p>
            <div style={{ width: '200px', height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', margin: '0 auto' }}>
              <div style={{
                width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%`,
                height: '100%', backgroundColor: '#7c3aed', borderRadius: '3px', transition: 'width 0.3s',
              }} />
            </div>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '32px', marginBottom: '8px' }}>📷</p>
            <p style={{ fontSize: '16px', color: '#666' }}>Drag & drop images here, or click to select</p>
            <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>PNG, JPG, WEBP (max 5MB each)</p>
          </>
        )}
      </div>

      {message && (
        <div style={{
          padding: '12px', borderRadius: '8px', marginBottom: '16px',
          backgroundColor: message.startsWith('Error') || message.includes('error') ? '#fee' : '#d4edda',
          color: message.startsWith('Error') || message.includes('error') ? '#c33' : '#155724',
          fontSize: '14px',
        }}>
          {message}
        </div>
      )}

      {/* Image Grid */}
      {loading ? <p>Loading...</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
          {images.map((img) => (
            <div key={img.id} style={{
              backgroundColor: 'white',
              borderRadius: '10px',
              border: '1px solid #eee',
              overflow: 'hidden',
            }}>
              <div style={{ height: '150px', backgroundColor: '#f9f9f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.public_url}
                  alt={img.file_name}
                  style={{ maxWidth: '100%', maxHeight: '150px', objectFit: 'contain' }}
                />
              </div>
              <div style={{ padding: '10px' }}>
                <p style={{ fontSize: '11px', fontFamily: 'monospace', color: '#666', wordBreak: 'break-all' }}>{img.file_name}</p>
                <p style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>{formatSize(img.size_bytes)}</p>
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <button
                    onClick={() => copyFileName(img.file_name)}
                    style={{
                      flex: 1, padding: '4px 8px', backgroundColor: '#f0f0f0', border: '1px solid #ddd',
                      borderRadius: '4px', cursor: 'pointer', fontSize: '11px',
                    }}
                  >
                    Copy Name
                  </button>
                  <button
                    onClick={() => handleDelete(img)}
                    style={{
                      padding: '4px 8px', backgroundColor: '#fee', border: '1px solid #fcc',
                      borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: '#c33',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && images.length === 0 && (
        <p style={{ textAlign: 'center', color: '#999', padding: '40px' }}>No images uploaded for this app yet</p>
      )}
    </div>
  )
}
