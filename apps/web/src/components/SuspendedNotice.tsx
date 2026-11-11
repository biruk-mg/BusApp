'use client'

import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { PauseCircle } from 'lucide-react'

/** Shown instead of a staff page when the platform admin suspended the person's company. */
export default function SuspendedNotice({ companyName }: { companyName?: string }) {
  const router = useRouter()
  const { logout } = useAuthStore()
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F8F8', padding: '24px' }}>
      <div style={{ background: 'white', border: '1px solid #EEEEEE', borderRadius: '16px', padding: '32px 24px', maxWidth: '420px', textAlign: 'center' }}>
        <PauseCircle size={40} color="#9A6B00" style={{ margin: '0 auto 12px' }} />
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#1a1a1a', marginBottom: '8px' }}>Account suspended</h1>
        <p style={{ fontSize: '14px', color: '#666', lineHeight: 1.6, marginBottom: '20px' }}>
          {companyName ? `${companyName}'s` : "Your company's"} account is suspended, so you can't sell tickets or manage trips right now.
          Please contact MugoBus to sort this out.
        </p>
        <button
          onClick={() => { logout(); router.push('/') }}
          style={{ background: '#1A0A0A', color: 'white', border: 'none', borderRadius: '10px', padding: '12px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
        >
          Log out
        </button>
      </div>
    </div>
  )
}
