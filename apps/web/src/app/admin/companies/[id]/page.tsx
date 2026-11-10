'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Company, errorOf } from '@/lib/admin'
import { formatPrice } from '@bus/utils'
import { ArrowLeft, KeyRound, PauseCircle, PlayCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface StaffRow { id: string; role: 'MANAGER' | 'SELLER' | 'CHECKER'; active: boolean; name: string; phone: string }
type Detail = Company & { pickupPoints: number; staff: StaffRow[] }

const ROLE_LABEL = { MANAGER: 'Manager', SELLER: 'Counter seller', CHECKER: 'Ticket checker' }
const label: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }
const input: React.CSSProperties = { width: '100%', border: '1px solid #E5E5E5', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', outline: 'none', background: 'white', boxSizing: 'border-box' }
const box: React.CSSProperties = { background: 'white', border: '1px solid #F0F0F0', borderRadius: '16px', padding: '22px', marginBottom: '20px' }

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [company, setCompany] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ companyName: '', licenseNo: '', phone: '', commissionPercent: '5', isDemo: false, notes: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/admin/operators/${id}`)
      const c: Detail = res.data.data.operator
      setCompany(c)
      setForm({
        companyName: c.companyName, licenseNo: c.licenseNo, phone: c.phone,
        commissionPercent: String(c.commissionPercent), isDemo: c.isDemo, notes: c.notes ?? '',
      })
    } catch (err) {
      toast.error(errorOf(err, 'Failed to load the company'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.patch(`/admin/operators/${id}`, {
        companyName: form.companyName, licenseNo: form.licenseNo, phone: form.phone,
        commissionPercent: Number(form.commissionPercent), isDemo: form.isDemo, notes: form.notes || null,
      })
      toast.success('Saved')
      load()
    } catch (err) {
      toast.error(errorOf(err, 'Failed to save'))
    } finally {
      setSaving(false)
    }
  }

  const suspend = async () => {
    const reason = window.prompt('Suspend this company? Its staff are stopped, its trips are hidden and nobody can book it. Existing bookings stay. Reason:')
    if (!reason) return
    try {
      await api.post(`/admin/operators/${id}/suspend`, { reason })
      toast.success('Company suspended')
      load()
    } catch (err) {
      toast.error(errorOf(err, 'Failed to suspend'))
    }
  }

  const reactivate = async () => {
    if (!confirm('Reactivate this company?')) return
    try {
      await api.post(`/admin/operators/${id}/reactivate`)
      toast.success('Company reactivated')
      load()
    } catch (err) {
      toast.error(errorOf(err, 'Failed to reactivate'))
    }
  }

  const resetPassword = async (s: StaffRow) => {
    const password = window.prompt(`New password for ${s.name} (at least 6 characters). Tell them in person or by phone:`)
    if (!password) return
    try {
      await api.post(`/admin/operators/${id}/staff/${s.id}/password`, { password })
      toast.success('Password changed')
    } catch (err) {
      toast.error(errorOf(err, 'Failed to change the password'))
    }
  }

  if (loading) return <p style={{ color: '#999' }}>Loading...</p>
  if (!company) return <p style={{ color: '#999' }}>Company not found.</p>
  const suspended = company.status === 'SUSPENDED'

  return (
    <div>
      <Link href="/admin/companies" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#666', textDecoration: 'none', marginBottom: '16px' }}>
        <ArrowLeft size={14} /> All companies
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>{company.companyName}</h1>
          <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>
            {company.buses} buses · {company.upcomingTrips} upcoming trips · {company.pickupPoints} pickup points
          </p>
          <p style={{ fontSize: '13px', marginTop: '6px' }}>
            <Link href={`/admin/payouts/${company.id}`} style={{ color: '#C0392B', fontWeight: 600 }}>Money and payouts →</Link>
          </p>
        </div>
        {suspended ? (
          <button onClick={reactivate} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2E8B57', color: 'white', border: 'none', padding: '11px 20px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            <PlayCircle size={16} /> Reactivate
          </button>
        ) : (
          <button onClick={suspend} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FFF8E5', color: '#9A6B00', border: '1px solid #F0DDA8', padding: '11px 20px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            <PauseCircle size={16} /> Suspend
          </button>
        )}
      </div>

      {suspended && (
        <div style={{ background: '#FFF8E5', border: '1px solid #F0DDA8', color: '#7A5600', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', fontSize: '14px' }}>
          <strong>Suspended.</strong> {company.suspendedReason}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          ['Online sales, 30 days', company.online30, '#2E8B57'],
          ['Counter sales, 30 days', company.counter30, '#D4A017'],
        ].map(([title, t, color]) => (
          <div key={title as string} style={{ background: 'white', border: '1px solid #F0F0F0', borderRadius: '14px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: '#999' }}>{title as string}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: color as string, marginTop: '4px' }}>{formatPrice((t as Company['online30']).total)}</div>
            <div style={{ fontSize: '12px', color: '#999' }}>{(t as Company['online30']).tickets} tickets</div>
          </div>
        ))}
        <div style={{ background: 'white', border: '1px solid #F0F0F0', borderRadius: '14px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#999' }}>Commission on online sales</div>
          <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px' }}>{company.commissionPercent}%</div>
          <div style={{ fontSize: '12px', color: '#999' }}>Counter sales carry none</div>
        </div>
      </div>

      <form onSubmit={save} style={box}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Company details</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div><label style={label}>Company name</label><input style={input} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required /></div>
          <div><label style={label}>License number</label><input style={input} value={form.licenseNo} onChange={(e) => setForm({ ...form, licenseNo: e.target.value })} required /></div>
          <div><label style={label}>Company phone</label><input style={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></div>
          <div><label style={label}>Commission on online sales (%)</label><p style={{ fontSize: '11px', color: '#999', margin: '0 0 6px', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>Applies to new online sales. Sales already paid keep the rate they were made at.</p><input style={input} type="number" min="0" max="50" step="0.5" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} required /></div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={label}>Notes (private)</label>
          <input style={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#555', marginBottom: '16px', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.isDemo} onChange={(e) => setForm({ ...form, isDemo: e.target.checked })} />
          Demo company (hidden from passengers, no online bookings)
        </label>
        <button type="submit" disabled={saving}
          style={{ background: saving ? '#999' : '#C0392B', color: 'white', border: 'none', padding: '11px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </form>

      <div style={box}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>Staff</h2>
        <p style={{ fontSize: '12px', color: '#999', marginBottom: '14px' }}>The company's managers add and remove their own staff. You can reset anyone's password, including a manager's.</p>
        {company.staff.map((s) => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '12px 0', borderTop: '1px solid #F5F5F5', opacity: s.active ? 1 : 0.55 }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontSize: '12px', color: '#999' }}>{ROLE_LABEL[s.role]} · {s.phone}{s.active ? '' : ' · removed'}</div>
            </div>
            <button onClick={() => resetPassword(s)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#F5F5F5', color: '#555', border: 'none', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              <KeyRound size={13} /> Reset password
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
