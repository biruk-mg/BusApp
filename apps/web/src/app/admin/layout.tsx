'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import Link from 'next/link'
import { Menu, X, Bus, MapPin, Calendar, Ticket, Users, LayoutDashboard, LogOut, Building2, Wallet, Megaphone, BarChart3 } from 'lucide-react'

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/companies', label: 'Companies', icon: Building2 },
  { href: '/admin/routes', label: 'Routes', icon: MapPin },
  { href: '/admin/schedules', label: 'Schedules', icon: Calendar },
  { href: '/admin/bookings', label: 'Bookings', icon: Ticket },
  { href: '/admin/sales', label: 'Sales', icon: BarChart3 },
  { href: '/admin/payouts', label: 'Payouts', icon: Wallet },
  { href: '/admin/banners', label: 'Offers', icon: Megaphone },
  { href: '/admin/users', label: 'Users', icon: Users },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isAuthenticated, logout, loadFromStorage } = useAuthStore()
  const [checking, setChecking] = useState(true)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    loadFromStorage()
    setTimeout(() => setChecking(false), 100)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!checking) {
      if (!isAuthenticated || user?.role !== 'ADMIN') {
        router.push('/login')
      }
    }
  }, [checking, isAuthenticated, user, router])

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  if (checking) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F8F8' }}>
      <p style={{ color: '#999' }}>Loading...</p>
    </div>
  )

  if (!isAuthenticated || user?.role !== 'ADMIN') return null

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#F8F8F8' }}>
      {/* Top bar + backdrop (phones and small tablets only) */}
      <div className="dash-topbar">
        <button
          aria-label="Open menu"
          onClick={() => setNavOpen(true)}
          style={{ background: 'none', border: 'none', color: 'white', display: 'flex', padding: '10px', cursor: 'pointer' }}
        >
          <Menu size={22} />
        </button>
        <span style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>
          Mugo<span style={{ color: '#C0392B' }}>Bus</span>
        </span>
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Admin Portal</span>
      </div>
      {navOpen && <div className="dash-backdrop" onClick={() => setNavOpen(false)} />}

      {/* Sidebar */}
      <aside className={`dash-sidebar${navOpen ? ' open' : ''}`} style={{ width: '240px', background: '#1A0A0A', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'fixed', top: 0, left: 0, height: '100vh' }}>
        {/* Logo */}
        <div style={{ padding: '28px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{ width: '28px', height: '28px', background: '#C0392B', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bus size={14} color="white" />
            </div>
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>
              Mugo<span style={{ color: '#C0392B' }}>Bus</span>
            </span>
          </div>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginLeft: '36px' }}>Admin Portal</p>
          <p style={{ fontSize: '11px', color: '#D4A017', marginLeft: '36px', marginTop: '2px' }}>{user?.name}</p>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px' }}>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/'))
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setNavOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', borderRadius: '8px', marginBottom: '4px',
                  textDecoration: 'none', fontSize: '13px', fontWeight: 500,
                  background: isActive ? 'rgba(192,57,43,0.25)' : 'transparent',
                  color: isActive ? 'white' : 'rgba(255,255,255,0.5)',
                  borderLeft: isActive ? '3px solid #C0392B' : '3px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={handleLogout}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="dash-main" style={{ flex: 1, marginLeft: '240px', padding: '32px 40px', minHeight: '100vh' }}>
        {children}
      </main>
    </div>
  )
}