'use client'

import Link from 'next/link'
import { useAuthStore } from '@/store/auth.store'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bus, Ticket, LogOut, User, Menu, X } from 'lucide-react'

export default function Navbar() {
  const { user, isAuthenticated, logout, loadFromStorage } = useAuthStore()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    loadFromStorage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogout = () => {
    logout()
    router.push('/')
    setMenuOpen(false)
  }

  return (
    <nav style={{ background: 'white', borderBottom: '1px solid #F0F0F0', position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 clamp(16px, 4vw, 80px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>

        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', flexShrink: 0 }}>
          <div style={{ width: '32px', height: '32px', background: '#C0392B', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bus size={16} color="white" />
          </div>
          <span style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>
            Ethio<span style={{ color: '#C0392B' }}>Bus</span>
          </span>
        </Link>
{/* Desktop Nav */}
        <div style={{ 
          display: typeof window !== 'undefined' && window.innerWidth <= 768 ? 'none' : 'flex', 
          alignItems: 'center', 
          gap: '32px' 
        }}>
          <Link href="/search" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Routes</Link>
          <Link href="/#why" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>About</Link>
        </div>

        {/* Desktop Auth */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isAuthenticated ? (
            <>
              <Link href="/bookings" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#666', textDecoration: 'none' }}>
                <Ticket size={16} /> <span style={{ display: 'none' }}>My Bookings</span>
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#1a1a1a' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#C0392B', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  onClick={() => router.push('/bookings')}>
                  <User size={15} color="white" />
                </div>
                <span style={{ fontSize: '14px', fontWeight: 500, display: window?.innerWidth > 640 ? 'block' : 'none' }}>
                  {user?.name?.split(' ')[0] ?? ''}
                </span>
              </div>
              <button
                onClick={handleLogout}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#999', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <LogOut size={14} />
              </button>
            </>
          ) : (
            <>
              <Link href="/login" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Sign In</Link>
              <Link
                href="/register"
                style={{ background: '#C0392B', color: 'white', fontSize: '13px', fontWeight: 600, padding: '10px 18px', borderRadius: '8px', textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                Book a Trip
              </Link>
            </>
          )}

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: '#666' }}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div style={{ background: 'white', borderTop: '1px solid #F0F0F0', padding: '16px clamp(16px, 4vw, 80px)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Link href="/search" onClick={() => setMenuOpen(false)}
            style={{ padding: '12px 0', fontSize: '15px', color: '#333', textDecoration: 'none', borderBottom: '1px solid #F5F5F5', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🚌 Find Buses
          </Link>
          {isAuthenticated ? (
            <>
              <Link href="/bookings" onClick={() => setMenuOpen(false)}
                style={{ padding: '12px 0', fontSize: '15px', color: '#333', textDecoration: 'none', borderBottom: '1px solid #F5F5F5', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🎫 My Bookings
              </Link>
              {user?.role === 'ADMIN' && (
                <Link href="/admin" onClick={() => setMenuOpen(false)}
                  style={{ padding: '12px 0', fontSize: '15px', color: '#333', textDecoration: 'none', borderBottom: '1px solid #F5F5F5' }}>
                  ⚙️ Admin Dashboard
                </Link>
              )}
              {user?.role === 'OPERATOR' && (
                <Link href="/operator" onClick={() => setMenuOpen(false)}
                  style={{ padding: '12px 0', fontSize: '15px', color: '#333', textDecoration: 'none', borderBottom: '1px solid #F5F5F5' }}>
                  🚌 Operator Portal
                </Link>
              )}
              <button onClick={handleLogout}
                style={{ padding: '12px 0', fontSize: '15px', color: '#C0392B', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LogOut size={16} /> Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" onClick={() => setMenuOpen(false)}
                style={{ padding: '12px 0', fontSize: '15px', color: '#333', textDecoration: 'none', borderBottom: '1px solid #F5F5F5' }}>
                Sign In
              </Link>
              <Link href="/register" onClick={() => setMenuOpen(false)}
                style={{ marginTop: '8px', background: '#C0392B', color: 'white', padding: '12px 16px', borderRadius: '8px', fontSize: '15px', fontWeight: 600, textDecoration: 'none', textAlign: 'center', display: 'block' }}>
                Create Account
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  )
}