'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Check if arriving from invite/recovery link (session in URL hash)
    const hash = window.location.hash
    const isInvite = hash.includes('type=invite') || hash.includes('type=recovery')
    const hasAccessToken = hash.includes('access_token')

    if (isInvite || hasAccessToken) {
      // Let Supabase client parse the hash and establish session first
      supabase.auth.getSession().then(() => {
        // Pass setup=1 to login page since hash is lost by router.push
        router.push('/login?setup=1')
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
