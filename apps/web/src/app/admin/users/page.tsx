'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Users, KeyRound, X } from 'lucide-react'
import { formatDate } from '@bus/utils'
import toast from 'react-hot-toast'

interface User {
  id: string
  name: string
  phone: string
  email: string | null
  role: string
  createdAt: string
  _count: { bookings: number }
}

// A temporary password that is easy to read out over the phone: no 0/O, 1/l/I
const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const makeTemporaryPassword = () => {
  const bytes = new Uint32Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => TEMP_ALPHABET[b % TEMP_ALPHABET.length]).join('')
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  // The person whose password is being reset, the temporary password, and whether it was saved
  const [reset, setReset] = useState<{ user: User; password: string; done: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  const saveReset = async () => {
    if (!reset) return
    setSaving(true)
    try {
      await api.post(`/admin/users/${reset.user.id}/password`, { password: reset.password })
      setReset({ ...reset, done: true })
      toast.success('Temporary password set')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      toast.error(error.response?.data?.error || 'Could not reset the password')
    } finally { setSaving(false) }
  }

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get('/auth/users')
        setUsers(res.data.data.users)
      } catch { toast.error('Failed to load users') }
      finally { setLoading(false) }
    }
    fetchUsers()
  }, [])

  const roleStyle = (role: string) => {
    if (role === 'ADMIN') return { bg: '#FFF5F5', color: '#C0392B' }
    if (role === 'OPERATOR') return { bg: '#FFFBEB', color: '#D4A017' }
    if (role === 'DRIVER') return { bg: '#F0FFF4', color: '#2E8B57' }
    return { bg: '#F5F5F5', color: '#666' }
  }

  const initials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Users size={22} color="#C0392B" /> Users
        </h1>
        <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>{users.length} registered users</p>
      </div>

      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFAFA' }}>
              {['User', 'Phone', 'Email', 'Role', 'Bookings', 'Joined', ''].map((h, i) => (
                <th key={i} style={{ textAlign: 'left', padding: '14px 20px', fontSize: '12px', color: '#999', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Loading...</td></tr>}
            {users.map((user) => {
              const rs = roleStyle(user.role)
              return (
                <tr key={user.id} style={{ borderTop: '1px solid #F5F5F5' }}>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#1A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#D4A017', flexShrink: 0 }}>
                        {initials(user.name)}
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{user.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: '13px', color: '#555' }}>{user.phone}</td>
                  <td style={{ padding: '14px 20px', fontSize: '13px', color: '#555' }}>{user.email || '—'}</td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', background: rs.bg, color: rs.color }}>{user.role}</span>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: '13px', color: '#555', textAlign: 'center' }}>{user._count.bookings}</td>
                  <td style={{ padding: '14px 20px', fontSize: '12px', color: '#999' }}>{formatDate(user.createdAt)}</td>
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    {user.role !== 'ADMIN' && (
                      <button
                        onClick={() => setReset({ user, password: makeTemporaryPassword(), done: false })}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#F5F5F5', color: '#555', border: 'none', borderRadius: '8px', padding: '7px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        <KeyRound size={13} /> Reset password
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {reset && (
        <div onClick={() => !saving && setReset(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 300 }}>
          <div role="dialog" aria-label="Reset password" onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a' }}>Reset password</h2>
              <button onClick={() => setReset(null)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', display: 'flex' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: '#666', lineHeight: 1.6, marginBottom: '14px' }}>
              {reset.user.name} ({reset.user.phone}). {reset.done
                ? 'Their old logins have stopped working. Tell them this temporary password now: it is not shown again after you close this box.'
                : 'This sets a temporary password and logs them out of every device. They must choose their own at the next login. Check you are speaking to the right person first.'}
            </p>
            <input
              value={reset.password}
              onChange={(e) => setReset({ ...reset, password: e.target.value })}
              readOnly={reset.done}
              minLength={6}
              autoComplete="off"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E0E0E0', borderRadius: '10px', padding: '12px 14px', fontSize: '16px', fontFamily: 'monospace', letterSpacing: '1px', marginBottom: '16px', background: reset.done ? '#F0FFF4' : 'white' }}
            />
            {reset.done ? (
              <button onClick={() => setReset(null)} style={{ background: '#1A0A0A', color: 'white', border: 'none', borderRadius: '10px', padding: '11px 22px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Done</button>
            ) : (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={saveReset} disabled={saving || reset.password.length < 6} style={{ background: saving || reset.password.length < 6 ? '#999' : '#C0392B', color: 'white', border: 'none', borderRadius: '10px', padding: '11px 22px', fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving...' : 'Set temporary password'}
                </button>
                <button onClick={() => setReset({ ...reset, password: makeTemporaryPassword() })} disabled={saving} style={{ background: '#F5F5F5', color: '#555', border: 'none', borderRadius: '10px', padding: '11px 16px', fontSize: '13px', cursor: 'pointer' }}>New suggestion</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}