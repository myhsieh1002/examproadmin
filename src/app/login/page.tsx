'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'set-password' | 'checking'>('checking')
  const router = useRouter()

  useEffect(() => {
    // Check if user arrived via invite/recovery link
    // Supabase puts session in URL hash after verifying token
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        if (session) {
          // User came from invite link — show set password form
          // Check if they have a real password set (invited users don't)
          setMode('set-password')
          return
        }
      }
    })

    // Also check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Already logged in, check if this is from an invite
        const hash = window.location.hash
        if (hash.includes('type=invite') || hash.includes('type=recovery')) {
          setMode('set-password')
        } else {
          router.push('/dashboard')
        }
      } else {
        setMode('login')
      }
    })
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  if (mode === 'checking') {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: '100vh', backgroundColor: '#1a1a2e', color: 'white',
      }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#1a1a2e',
      padding: '16px',
      boxSizing: 'border-box',
    }}>
      <form onSubmit={mode === 'set-password' ? handleSetPassword : handleLogin} style={{
        backgroundColor: 'white',
        padding: '32px 24px',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '400px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        boxSizing: 'border-box',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="ExamPro" width={240} height={160} style={{ objectFit: 'contain', margin: '0 auto' }} />
        </div>

        {mode === 'set-password' ? (
          <>
            <p style={{ textAlign: 'center', color: '#333', fontSize: '16px', fontWeight: '600' }}>
              Set Your Password
            </p>
            <p style={{ textAlign: 'center', color: '#666', fontSize: '14px', marginBottom: '8px' }}>
              Welcome! Please set a password to complete your account setup.
            </p>
          </>
        ) : (
          <p style={{ textAlign: 'center', color: '#666', fontSize: '14px', marginBottom: '16px' }}>
            Sign in to admin panel
          </p>
        )}

        {error && (
          <div style={{ backgroundColor: '#fee', color: '#c33', padding: '12px', borderRadius: '8px', fontSize: '14px' }}>
            {error}
          </div>
        )}

        {mode === 'login' && (
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              padding: '12px',
              border: '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          />
        )}

        <input
          type="password"
          placeholder={mode === 'set-password' ? 'New password (min 6 characters)' : 'Password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{
            padding: '12px',
            border: '1px solid #ddd',
            borderRadius: '8px',
            fontSize: '14px',
          }}
        />

        {mode === 'set-password' && (
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            style={{
              padding: '12px',
              border: '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          />
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '12px',
            backgroundColor: '#0f3460',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading
            ? (mode === 'set-password' ? 'Setting password...' : 'Signing in...')
            : (mode === 'set-password' ? 'Set Password & Enter' : 'Sign In')
          }
        </button>
      </form>
    </div>
  )
}
