'use client'

import { useRouter } from 'next/navigation'
import { Bus, LogOut } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useStaffGuard, Allowed } from '@/hooks/useStaffGuard'
import { STAFF_ROLE_LABEL } from '@/lib/staffHome'
import SuspendedNotice from '@/components/SuspendedNotice'

/**
 * A simple full-width page for staff who work on a phone (counter sellers, ticket
 * checkers): company and name at the top, a logout button, and the page content.
 */
export default function StaffShell({
  allowed, title, children,
}: {
  allowed: Allowed[]
  title: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const { logout } = useAuthStore()
  const { ready, user, suspended } = useStaffGuard(allowed)

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F8F8' }}>
        <p style={{ color: '#999' }}>Loading...</p>
      </div>
    )
  }

  if (suspended) return <SuspendedNotice companyName={user?.staff?.companyName} />

  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8' }}>
      <header style={{ background: '#1A0A0A', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '30px', height: '30px', background: '#C0392B', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bus size={15} color="white" />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'white' }}>{user?.staff?.companyName || 'MugoBus'}</div>
            <div style={{ fontSize: '11px', color: '#D4A017' }}>
              {user?.name}{user?.staff ? ` · ${STAFF_ROLE_LABEL[user.staff.role]}` : ''}
            </div>
          </div>
        </div>
        <button
          onClick={() => { logout(); router.push('/') }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer' }}
        >
          <LogOut size={14} /> Logout
        </button>
      </header>
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '28px 20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1a1a1a', marginBottom: '16px' }}>{title}</h1>
        {children}
      </main>
    </div>
  )
}
