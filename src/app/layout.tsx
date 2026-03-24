'use client'
import './globals.css'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AppContext } from '@/hooks/useCurrentApp'
import { supabase } from '@/lib/supabase-browser'
import Link from 'next/link'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/questions', label: 'Questions', icon: '📝' },
  { href: '/import', label: 'Import', icon: '📥' },
  { href: '/categories', label: 'Categories', icon: '📁' },
]

const apps = [
  { id: 'npexam', label: '專科護理師' },
  { id: 'nurseexam', label: '護理師國考' },
  { id: 'surgeonexam', label: '外科專科醫師' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [currentApp, setCurrentApp] = useState('npexam')
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && pathname !== '/login') {
        router.push('/login')
      } else {
        setIsAuthenticated(!!session)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && pathname !== '/login') {
        router.push('/login')
      }
      setIsAuthenticated(!!session)
    })

    return () => subscription.unsubscribe()
  }, [pathname, router])

  if (pathname === '/login') {
    return (
      <html lang="zh-TW">
        <body>{children}</body>
      </html>
    )
  }

  if (isAuthenticated === null) {
    return (
      <html lang="zh-TW">
        <body>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            Loading...
          </div>
        </body>
      </html>
    )
  }

  return (
    <html lang="zh-TW">
      <body>
        <AppContext.Provider value={{ currentApp, setCurrentApp }}>
          <div style={{ display: 'flex', minHeight: '100vh' }}>
            {/* Sidebar */}
            <aside style={{
              width: '240px',
              backgroundColor: '#1a1a2e',
              color: 'white',
              padding: '24px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              flexShrink: 0,
            }}>
              <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px', padding: '0 8px' }}>
                ExamPro Admin
              </h1>

              {/* App Switcher */}
              <select
                value={currentApp}
                onChange={(e) => setCurrentApp(e.target.value)}
                style={{
                  backgroundColor: '#16213e',
                  color: 'white',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  padding: '8px',
                  marginBottom: '16px',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                {apps.map((app) => (
                  <option key={app.id} value={app.id}>{app.label}</option>
                ))}
              </select>

              {/* Nav Links */}
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {navItems.map((item) => {
                  const isActive = pathname.startsWith(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        color: isActive ? 'white' : '#aaa',
                        backgroundColor: isActive ? '#0f3460' : 'transparent',
                        fontSize: '14px',
                        transition: 'all 0.2s',
                      }}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </nav>

              <div style={{ marginTop: 'auto' }}>
                <button
                  onClick={() => { supabase.auth.signOut(); router.push('/login') }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: 'transparent',
                    color: '#888',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Sign Out
                </button>
              </div>
            </aside>

            {/* Main Content */}
            <main style={{ flex: 1, padding: '24px 32px', backgroundColor: '#f8f9fa', overflowY: 'auto' }}>
              {children}
            </main>
          </div>
        </AppContext.Provider>
      </body>
    </html>
  )
}
