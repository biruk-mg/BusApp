'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { EarningsPage, PAYOUT_METHOD_LABEL, PayoutMethod, PayoutRow, errorOf } from '@/lib/admin'
import EarningsView from '@/components/EarningsView'
import { formatPrice } from '@bus/utils'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

const label: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }
const input: React.CSSProperties = { width: '100%', border: '1px solid #E5E5E5', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', outline: 'none', background: 'white', boxSizing: 'border-box' }
const METHODS = Object.keys(PAYOUT_METHOD_LABEL) as PayoutMethod[]
const empty = { amount: '', method: 'TELEBIRR' as PayoutMethod, reference: '', note: '' }

export default function CompanyPayoutPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<EarningsPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/admin/operators/${id}/earnings`)
      setData(res.data.data)
    } catch (err) {
      toast.error(errorOf(err, 'Failed to load this company'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const record = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post(`/admin/operators/${id}/payouts`, {
        amount: Number(form.amount),
        method: form.method,
        reference: form.reference.trim() || undefined,
        note: form.note.trim() || undefined,
      })
      toast.success('Payout recorded')
      setForm(empty)
      load()
    } catch (err) {
      toast.error(errorOf(err, 'Could not record the payout'))
    } finally {
      setSaving(false)
    }
  }

  const voidPayout = async (p: PayoutRow) => {
    const reason = window.prompt(`Cancel the ${formatPrice(p.amount)} payout? Why? (it stays in the history)`)
    if (reason === null) return
    try {
      await api.post(`/admin/payouts/${p.id}/void`, { reason })
      toast.success('Payout cancelled')
      load()
    } catch (err) {
      toast.error(errorOf(err, 'Could not cancel the payout'))
    }
  }

  if (loading) return <p style={{ color: '#999' }}>Loading...</p>
  if (!data) return <p style={{ color: '#999' }}>Company not found.</p>

  const needsReceipt = form.method !== 'CASH'

  return (
    <div>
      <Link href="/admin/payouts" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#666', textDecoration: 'none', marginBottom: '12px' }}>
        <ArrowLeft size={14} /> All payouts
      </Link>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>{data.company.companyName}</h1>
      <p style={{ fontSize: '13px', color: '#999', margin: '4px 0 20px' }}>
        <Link href={`/admin/companies/${data.company.id}`} style={{ color: '#C0392B' }}>Company details</Link>
      </p>

      <form onSubmit={record} style={{ background: 'white', border: '1px solid #F0F0F0', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>Record a payout</h2>
        <p style={{ fontSize: '12px', color: '#999', marginBottom: '14px', lineHeight: 1.6 }}>
          Send the money first (Telebirr, bank...), then record it here. This does not send any money. At most {formatPrice(data.summary.due)} can be recorded now.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginBottom: '14px' }}>
          <div>
            <label style={label}>Amount (ETB)</label>
            <input style={input} type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </div>
          <div>
            <label style={label}>How it was sent</label>
            <select style={input} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PayoutMethod })}>
              {METHODS.map((m) => <option key={m} value={m}>{PAYOUT_METHOD_LABEL[m]}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Receipt number{needsReceipt ? '' : ' (optional)'}</label>
            <input style={input} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} required={needsReceipt} minLength={needsReceipt ? 3 : undefined} placeholder="Transaction number" />
          </div>
          <div>
            <label style={label}>Note (the company can see it)</label>
            <input style={input} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={300} placeholder="e.g. Sales 1–15 Nov" />
          </div>
        </div>
        <button type="submit" disabled={saving || data.summary.due <= 0} style={{ background: saving || data.summary.due <= 0 ? '#BBB' : '#2E8B57', color: 'white', border: 'none', padding: '11px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: saving || data.summary.due <= 0 ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving...' : 'Record payout'}
        </button>
        {data.summary.due <= 0 && <span style={{ fontSize: '12px', color: '#999', marginLeft: '12px' }}>Nothing is due right now.</span>}
      </form>

      <EarningsView data={data} audience="admin" onVoid={voidPayout} />
    </div>
  )
}
