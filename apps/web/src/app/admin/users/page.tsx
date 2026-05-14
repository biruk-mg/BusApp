'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Users } from 'lucide-react'
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

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

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
              {['User', 'Phone', 'Email', 'Role', 'Bookings', 'Joined'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '14px 20px', fontSize: '12px', color: '#999', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Loading...</td></tr>}
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
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}