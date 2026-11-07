'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { STAFF_ROLE_LABEL } from '@/lib/staffHome'
import { Users, Plus, X, KeyRound, UserX, UserCheck } from 'lucide-react'
import type { StaffRole } from '@bus/types'
import toast from 'react-hot-toast'

interface StaffMember {
  id: string
  role: StaffRole
  active: boolean
  user: { id: string; name: string; phone: string }
}

const ROLES: StaffRole[] = ['MANAGER', 'SELLER', 'CHECKER']
const ROLE_HELP: Record<StaffRole, string> = {
  MANAGER: 'Full access: buses, schedules, bookings, staff',
  SELLER: 'Sells tickets at the counter',
  CHECKER: 'Checks passengers on at boarding',
}

const errorText = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: string } } }).response?.data?.error || fallback

const label: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '8px',
  textTransform: 'uppercase', letterSpacing: '0.5px',
}
const input: React.CSSProperties = {
  width: '100%', border: '1px solid #E5E5E5', borderRadius: '10px', padding: '11px 14px',
  fontSize: '14px', outline: 'none', background: 'white', boxSizing: 'border-box',
}
const smallBtn = (bg: string, color: string): React.CSSProperties => ({
  background: bg, color, border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600,
})

const emptyForm = { name: '', phone: '', password: '', role: 'SELLER' as StaffRole }

export default function OperatorStaffPage() {
  const myId = useAuthStore((s) => s.user?.id)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [resetFor, setResetFor] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await api.get('/operator/staff')
      setStaff(res.data.data.staff)
    } catch (err) {
      toast.error(errorText(err, 'Failed to load staff'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post('/operator/staff', form)
      toast.success('Staff member added. Give them their phone number and password.')
      setForm(emptyForm)
      setShowForm(false)
      load()
    } catch (err) {
      toast.error(errorText(err, 'Failed to add staff member'))
    } finally {
      setSubmitting(false)
    }
  }

  const change = async (member: StaffMember, body: { role?: StaffRole; active?: boolean }) => {
    try {
      await api.patch(`/operator/staff/${member.id}`, body)
      toast.success('Saved')
      load()
    } catch (err) {
      toast.error(errorText(err, 'Failed to update'))
      load()
    }
  }

  const deactivate = (member: StaffMember) => {
    if (!confirm(`Remove ${member.user.name}'s access? They can no longer sign in to the portal. You can switch it back on later.`)) return
    change(member, { active: false })
  }

  const savePassword = async (member: StaffMember) => {
    try {
      await api.post(`/operator/staff/${member.id}/password`, { password: newPassword })
      toast.success('Password changed. Tell them the new password.')
      setResetFor(null)
      setNewPassword('')
    } catch (err) {
      toast.error(errorText(err, 'Failed to change password'))
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={22} color="#C0392B" /> Staff
          </h1>
          <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>
            People who work for your company and what they can do.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#C0392B', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={16} /> Add staff
        </button>
      </div>

      {showForm && (
        <form onSubmit={add} style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700 }}>New staff member</h2>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}><X size={18} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '12px' }}>
            <div>
              <label style={label}>Full name</label>
              <input style={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} placeholder="Abebe Kebede" />
            </div>
            <div>
              <label style={label}>Phone number</label>
              <input style={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required placeholder="0911000000" inputMode="tel" />
            </div>
            <div>
              <label style={label}>Temporary password</label>
              <input style={input} type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} placeholder="At least 6 characters" autoComplete="off" />
            </div>
            <div>
              <label style={label}>Role</label>
              <select style={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}>
                {ROLES.map((r) => <option key={r} value={r}>{STAFF_ROLE_LABEL[r]}</option>)}
              </select>
            </div>
          </div>
          <p style={{ fontSize: '12px', color: '#999', marginBottom: '16px' }}>
            {ROLE_HELP[form.role]}. This creates a new account, so the phone number must not be registered already.
            Staff cannot change their own password yet. If they forget it, set a new one here.
          </p>
          <button type="submit" disabled={submitting} style={{ background: submitting ? '#999' : '#C0392B', color: 'white', border: 'none', padding: '11px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}>
            {submitting ? 'Adding...' : 'Add staff member'}
          </button>
        </form>
      )}

      {loading && <p style={{ color: '#999', fontSize: '13px' }}>Loading...</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {staff.map((m) => {
          const isMe = m.user.id === myId
          return (
            <div key={m.id} style={{ background: 'white', border: '1px solid #F0F0F0', borderRadius: '12px', padding: '14px 16px', opacity: m.active ? 1 : 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>
                    {m.user.name} {isMe && <span style={{ fontSize: '11px', color: '#999', fontWeight: 400 }}>(you)</span>}
                  </div>
                  <div style={{ fontSize: '12px', color: '#999' }}>{m.user.phone}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', background: m.active ? '#F0FFF4' : '#F5F5F5', color: m.active ? '#2E8B57' : '#999' }}>
                    {m.active ? 'Active' : 'No access'}
                  </span>
                  {isMe ? (
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>{STAFF_ROLE_LABEL[m.role]}</span>
                  ) : (
                    <>
                      <select
                        value={m.role}
                        onChange={(e) => change(m, { role: e.target.value as StaffRole })}
                        style={{ ...input, width: 'auto', padding: '6px 10px', fontSize: '12px' }}
                        aria-label={`Role of ${m.user.name}`}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{STAFF_ROLE_LABEL[r]}</option>)}
                      </select>
                      {m.active ? (
                        <button onClick={() => deactivate(m)} style={smallBtn('#FFF5F5', '#C0392B')}><UserX size={13} /> Remove access</button>
                      ) : (
                        <button onClick={() => change(m, { active: true })} style={smallBtn('#F0FFF4', '#2E8B57')}><UserCheck size={13} /> Restore access</button>
                      )}
                      {m.role !== 'MANAGER' && (
                        <button onClick={() => { setResetFor(resetFor === m.id ? null : m.id); setNewPassword('') }} style={smallBtn('#F5F5F5', '#555')}>
                          <KeyRound size={13} /> New password
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {resetFor === m.id && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                  <input style={{ ...input, width: '240px' }} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (6+ characters)" autoComplete="off" />
                  <button onClick={() => savePassword(m)} disabled={newPassword.length < 6} style={smallBtn(newPassword.length < 6 ? '#EEE' : '#C0392B', newPassword.length < 6 ? '#999' : 'white')}>Save password</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
