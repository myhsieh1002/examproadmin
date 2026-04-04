'use client'
import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase-browser'
import { useRouter, useSearchParams } from 'next/navigation'

type Mode = 'login' | 'set-password' | 'forgot-password' | 'reset-sent' | 'checking'

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#1a1a2e', color: 'white' }}>Loading...</div>}>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<Mode>('checking')
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // setup=1 query param means user came from invite/recovery link (hash was lost in router push)
    const setupMode = searchParams.get('setup') === '1'

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && setupMode) {
        setMode('set-password')
        return
      }
      if (session) {
        // Check URL hash directly (if user landed here without going through /)
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

    // Listen for password recovery events (when user clicks reset link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        setMode('set-password')
      }
    })

    return () => subscription.unsubscribe()
  }, [router, searchParams])

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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email) {
      setError('Please enter your email')
      return
    }
    setLoading(true)
    const siteUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: siteUrl,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setMode('reset-sent')
    }
  }

  if (mode === 'checking') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#1a1a2e', color: 'white' }}>
        Loading...
      </div>
    )
  }

  const inputStyle = { padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }
  const primaryBtnStyle = {
    padding: '12px', backgroundColor: '#0f3460', color: 'white', border: 'none',
    borderRadius: '8px', fontSize: '16px', cursor: loading ? 'not-allowed' as const : 'pointer' as const,
    opacity: loading ? 0.7 : 1,
  }

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', backgroundColor: '#1a1a2e', padding: '16px', boxSizing: 'border-box',
    }}>
      <form
        onSubmit={
          mode === 'set-password' ? handleSetPassword :
          mode === 'forgot-password' ? handleForgotPassword :
          handleLogin
        }
        style={{
          backgroundColor: 'white', padding: '32px 24px', borderRadius: '12px',
          width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column',
          gap: '16px', boxSizing: 'border-box',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="ExamPro" width={240} height={160} style={{ objectFit: 'contain', margin: '0 auto' }} />
        </div>

        {mode === 'set-password' && (
          <>
            <p style={{ textAlign: 'center', color: '#333', fontSize: '16px', fontWeight: '600' }}>Set Your Password</p>
            <p style={{ textAlign: 'center', color: '#666', fontSize: '14px', marginBottom: '8px' }}>
              Please set a password to complete your account setup.
            </p>
          </>
        )}
        {mode === 'forgot-password' && (
          <>
            <p style={{ textAlign: 'center', color: '#333', fontSize: '16px', fontWeight: '600' }}>Reset Password</p>
            <p style={{ textAlign: 'center', color: '#666', fontSize: '14px', marginBottom: '8px' }}>
              Enter your email and we&apos;ll send you a reset link.
            </p>
          </>
        )}
        {mode === 'reset-sent' && (
          <>
            <p style={{ textAlign: 'center', color: '#333', fontSize: '16px', fontWeight: '600' }}>Check Your Email</p>
            <p style={{ textAlign: 'center', color: '#666', fontSize: '14px', marginBottom: '8px' }}>
              If the email exists, a reset link has been sent. Click the link to set a new password.
            </p>
          </>
        )}
        {mode === 'login' && (
          <p style={{ textAlign: 'center', color: '#666', fontSize: '14px', marginBottom: '16px' }}>
            Sign in to admin panel
          </p>
        )}

        {error && (
          <div style={{ backgroundColor: '#fee', color: '#c33', padding: '12px', borderRadius: '8px', fontSize: '14px' }}>
            {error}
          </div>
        )}
        {info && (
          <div style={{ backgroundColor: '#d4edda', color: '#155724', padding: '12px', borderRadius: '8px', fontSize: '14px' }}>
            {info}
          </div>
        )}

        {(mode === 'login' || mode === 'forgot-password') && (
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
        )}

        {mode === 'login' && (
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
        )}

        {mode === 'set-password' && (
          <>
            <input
              type="password"
              placeholder="New password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </>
        )}

        {mode !== 'reset-sent' && (
          <button type="submit" disabled={loading} style={primaryBtnStyle}>
            {loading
              ? 'Please wait...'
              : mode === 'set-password' ? 'Set Password & Enter'
              : mode === 'forgot-password' ? 'Send Reset Link'
              : 'Sign In'
            }
          </button>
        )}

        {/* Mode switches */}
        {mode === 'login' && (
          <button
            type="button"
            onClick={() => { setError(''); setInfo(''); setMode('forgot-password') }}
            style={{ background: 'none', border: 'none', color: '#0f3460', fontSize: '13px', cursor: 'pointer', padding: '4px' }}
          >
            Forgot password?
          </button>
        )}

        {(mode === 'forgot-password' || mode === 'reset-sent') && (
          <button
            type="button"
            onClick={() => { setError(''); setInfo(''); setMode('login') }}
            style={{ background: 'none', border: 'none', color: '#0f3460', fontSize: '13px', cursor: 'pointer', padding: '4px' }}
          >
            ← Back to sign in
          </button>
        )}
      </form>
    </div>
  )
}
