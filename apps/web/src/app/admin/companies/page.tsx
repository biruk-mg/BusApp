'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Company, errorOf } from '@/lib/admin'
import { Plus, X } from 'lucide-react'
import { formatPrice } from '@bus/utils'
import toast from 'react-hot-toast'

const label: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }
const input: React.CSSProperties = { width: '100%', border: '1px solid #E5E5E5', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', outline: 'none', background: 'white', boxSizing: 'border-box' }

const empty = {
  companyName: '', licenseNo: '', phone: '',
  managerName: '', managerPhone: '', managerPassword: '',
  commissionPercent: '5', isDemo: false, notes: '',
}

const badge = (text: string, bg: string, color: string) => (
  <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '20px', background: bg, color, marginRight: '6px' }}>{text}</span>
)

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get('/admin/operators')
      setCompanies(res.data.data.operators)
    } catch (err) {
      toast.error(errorOf(err, 'Failed to load companies'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const set = (k: keyof typeof empty, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/admin/operators', {
        companyName: form.companyName, licenseNo: form.licenseNo, phone: form.phone,
        managerName: form.managerName, managerPhone: form.managerPhone, managerPassword: form.managerPassword,
        commissionPercent: Number(form.commissionPercent), isDemo: form.isDemo, notes: form.notes || undefined,
      })
      toast.success('Company created. Give the manager their phone number and password.')
      setForm(empty)
      setShowForm(false)
      load()
    } catch (err) {
      toast.error(errorOf(err, 'Failed to create the company'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>Companies</h1>
          <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>Bus companies on the platform. Sales are for the last 30 days.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#C0392B', color: 'white', border: 'none', padding: '11px 20px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
          {showForm ? <><X size={16} /> Close</> : <><Plus size={16} /> Add company</>}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={{ background: 'white', border: '1px solid #F0F0F0', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>New company</h2>
          <p style={{ fontSize: '12px', color: '#999', marginBottom: '16px' }}>
            Check the operator's license first. This creates the company and its first manager's account together.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div><label style={label}>Company name</label><input style={input} value={form.companyName} onChange={(e) => set('companyName', e.target.value)} required /></div>
            <div><label style={label}>License number</label><input style={input} value={form.licenseNo} onChange={(e) => set('licenseNo', e.target.value)} required /></div>
            <div><label style={label}>Company phone</label><input style={input} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0911223344" required /></div>
            <div><label style={label}>Commission on online sales (%)</label><input style={input} type="number" min="0" max="50" step="0.5" value={form.commissionPercent} onChange={(e) => set('commissionPercent', e.target.value)} required /></div>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, margin: '8px 0', color: '#1a1a1a' }}>First manager</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div><label style={label}>Manager name</label><input style={input} value={form.managerName} onChange={(e) => set('managerName', e.target.value)} required /></div>
            <div><label style={label}>Manager phone (login)</label><input style={input} value={form.managerPhone} onChange={(e) => set('managerPhone', e.target.value)} placeholder="0911223344" required /></div>
            <div><label style={label}>Starting password</label><input style={input} type="text" value={form.managerPassword} onChange={(e) => set('managerPassword', e.target.value)} minLength={6} required /></div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={label}>Notes (private, only you see them)</label>
            <input style={input} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. Met on 12 Nov, license checked, pilot operator" />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#555', marginBottom: '16px', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isDemo} onChange={(e) => set('isDemo', e.target.checked)} />
            Demo company (hidden from passengers, no online bookings)
          </label>
          <button type="submit" disabled={saving}
            style={{ background: saving ? '#999' : '#C0392B', color: 'white', border: 'none', padding: '12px 28px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Creating...' : 'Create company'}
          </button>
        </form>
      )}

      {loading && <p style={{ color: '#999' }}>Loading...</p>}
      {!loading && companies.length === 0 && <p style={{ color: '#999' }}>No companies yet.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {companies.map((c) => (
          <Link key={c.id} href={`/admin/companies/${c.id}`} style={{ textDecoration: 'none' }}>
            <div style={{ background: 'white', border: '1px solid #F0F0F0', borderRadius: '16px', padding: '18px 20px', opacity: c.status === 'SUSPENDED' ? 0.75 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a', marginBottom: '6px' }}>{c.companyName}</div>
                  <div>
                    {c.status === 'SUSPENDED' ? badge('Suspended', '#FFF8E5', '#9A6B00') : badge('Active', '#F0FFF4', '#2E8B57')}
                    {c.isDemo && badge('Demo', '#EEF2FF', '#4169E1')}
                    {badge(`${c.commissionPercent}% commission`, '#F5F5F5', '#666')}
                  </div>
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
                    Manager: {c.manager ? `${c.manager.name} · ${c.manager.phone}` : <span style={{ color: '#C0392B', fontWeight: 600 }}>none active</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '12px', color: '#999' }}>
                  <div><div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a' }}>{c.buses}</div>buses</div>
                  <div><div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a' }}>{c.upcomingTrips}</div>upcoming trips</div>
                  <div><div style={{ fontSize: '16px', fontWeight: 700, color: '#2E8B57' }}>{formatPrice(c.online30.total)}</div>online · {c.online30.tickets}</div>
                  <div><div style={{ fontSize: '16px', fontWeight: 700, color: '#D4A017' }}>{formatPrice(c.counter30.total)}</div>counter · {c.counter30.tickets}</div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
