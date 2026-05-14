'use client'

import Link from 'next/link'
import { useAuthStore } from '@/store/auth.store'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bus, Ticket, LogOut, User } from 'lucide-react'

export default function Navbar() {
  const { user, isAuthenticated, logout, loadFromStorage } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    loadFromStorage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  return (
    <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 80px', borderBottom: '1px solid #F0F0F0', background: 'white', position: 'sticky', top: 0, zIndex: 100 }}>
      {/* Logo */}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
        <div style={{ width: '32px', height: '32px', background: '#C0392B', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bus size={16} color="white" />
        </div>
        <span style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>
          Ethio<span style={{ color: '#C0392B' }}>Bus</span>
        </span>
      </Link>

      {/* Nav Links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
        <Link href="/search" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Routes</Link>
        <Link href="/#why" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>About</Link>
        <Link href="/#contact" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Contact</Link>
      </div>

      {/* Auth */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {isAuthenticated ? (
          <>
            <Link href="/bookings" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#666', textDecoration: 'none' }}>
              <Ticket size={16} /> My Bookings
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#1a1a1a' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#C0392B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={14} color="white" />
              </div>
            {user?.name?.split(' ')[0] ?? ''}            </div>
            <button
              onClick={handleLogout}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#999', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <LogOut size={14} /> Logout
            </button>
          </>
        ) : (
          <>
            <Link href="/login" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Sign In</Link>
            <Link
              href="/register"
              style={{ background: '#C0392B', color: 'white', fontSize: '13px', fontWeight: 600, padding: '10px 22px', borderRadius: '8px', textDecoration: 'none' }}
            >
              Book a Trip
            </Link>
          </>
        )}
      </div>
    </nav>
  )
}