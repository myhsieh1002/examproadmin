'use client'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AppContext } from '@/hooks/useCurrentApp'
import { supabase } from '@/lib/supabase-browser'
import Link from 'next/link'

const baseNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/questions', label: 'Questions', icon: '📝' },
  { href: '/import', label: 'Import', icon: '📥' },
  { href: '/categories', label: 'Categories', icon: '📁' },
]

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [currentApp, setCurrentApp] = useState('npexam')
  const [appList, setAppList] = useState<{ id: string; label: string }[]>([])
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && pathname !== '/login') {
        router.push('/login')
      } else {
        setIsAuthenticated(!!session)
        if (session?.user) {
          setUserId(session.user.id)
          supabase
            .from('admin_users')
            .select('role')
            .eq('id', session.user.id)
            .single()
            .then(({ data }) => {
              setUserRole(data?.role || 'editor')
            })
        }
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

  // Dynamically load app list from database
  useEffect(() => {
    if (!isAuthenticated) return
    fetch('/api/questions?action=apps')
      .then(res => res.ok ? res.json() : [])
      .then((apps: { id: string; display_name: string }[]) => {
        const list = apps.map(a => ({ id: a.id, label: a.display_name }))
        setAppList(list)
        if (list.length > 0 && !list.find(a => a.id === currentApp)) {
          setCurrentApp(list[0].id)
        }
      })
      .catch(() => {})
  }, [isAuthenticated])

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  if (pathname === '/login') {
    return <>{children}</>
  }

  if (isAuthenticated === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        Loading...
      </div>
    )
  }

  const navItems = userRole === 'super_admin'
    ? [...baseNavItems, { href: '/users', label: 'Users', icon: '👥' }]
    : baseNavItems

  return (
    <AppContext.Provider value={{ currentApp, setCurrentApp, userRole, userId }}>
      <style>{`
        @media (max-width: 768px) {
          .sidebar {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            z-index: 1000 !important;
            transform: translateX(-100%);
            transition: transform 0.3s ease;
          }
          .sidebar.open {
            transform: translateX(0);
          }
          .sidebar-overlay {
            display: block !important;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 999;
          }
          .mobile-header {
            display: flex !important;
          }
          .main-content {
            padding: 16px !important;
          }
        }
        @media (min-width: 769px) {
          .sidebar-overlay {
            display: none !important;
          }
          .mobile-header {
            display: none !important;
          }
        }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100vh' }}>
        {/* Mobile Header */}
        <div className="mobile-header" style={{
          display: 'none',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '56px',
          backgroundColor: '#1a1a2e',
          color: 'white',
          alignItems: 'center',
          padding: '0 16px',
          zIndex: 998,
          gap: '12px',
        }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ☰
          </button>
          <span style={{ fontSize: '16px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
            ExamPro Admin
          </span>
        </div>

        {/* Sidebar Overlay (mobile) */}
        {sidebarOpen && (
          <div
            className="sidebar-overlay"
            onClick={() => setSidebarOpen(false)}
            style={{ display: 'none' }}
          />
        )}

        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} style={{
          width: '240px',
          backgroundColor: '#1a1a2e',
          color: 'white',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 8px', marginBottom: '8px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="ExamPro" width={120} height={60} style={{ objectFit: 'contain' }} />
          </div>

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
            {appList.map((app) => (
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

          <div style={{ marginTop: 'auto', fontSize: '12px', color: '#666', padding: '0 8px', marginBottom: '8px' }}>
            {userRole && <span style={{ textTransform: 'capitalize' }}>{userRole.replace('_', ' ')}</span>}
          </div>
          <div>
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
        <main className="main-content" style={{
          flex: 1,
          padding: '24px 32px',
          backgroundColor: '#f8f9fa',
          overflowY: 'auto',
          marginTop: '0px',
        }}>
          <style>{`
            @media (max-width: 768px) {
              .main-content {
                margin-top: 56px !important;
              }
            }
          `}</style>
          {children}
        </main>
      </div>
    </AppContext.Provider>
  )
}
