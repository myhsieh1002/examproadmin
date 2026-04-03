'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Check if arriving from invite/recovery link (session in URL hash)
    const hash = window.location.hash
    if (hash.includes('access_token') || hash.includes('type=invite') || hash.includes('type=recovery')) {
      // Let Supabase client parse the hash and establish session, then go to login for password setup
      supabase.auth.getSession().then(() => {
        router.push('/login')
      })
      return
    }

    router.push('/dashboard')
  }, [router])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      Loading...
    </div>
  )
}
