'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { BalanceRow, errorOf } from '@/lib/admin'
import { formatDate, formatPrice } from '@bus/utils'
import { Wallet, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

interface Totals { gross: number; commission: number; paid: number; due: number }

export default function PayoutsPage() {
  const [companies, setCompanies] = useState<BalanceRow[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/payouts')
      .then((res) => { setCompanies(res.data.data.companies); setTotals(res.data.data.totals) })
      .catch((err) => toast.error(errorOf(err, 'Failed to load payouts')))
      .finally(() => setLoading(false))
  }, [])

  const stat = (label: string, value: number, color = '#1a1a1a') => (
    <div style={{ background: 'white', border: '1px solid #F0F0F0', borderRadius: '16px', padding: '16px 18px' }}>
      <div style={{ fontSize: '12px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '6px', color }}>{formatPrice(value)}</div>
    </div>
  )

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Wallet size={22} color="#C0392B" /> Payouts
      </h1>
      <p style={{ fontSize: '13px', color: '#999', margin: '4px 0 20px', lineHeight: 1.6 }}>
        Online sales are paid to the platform. Each company is owed its share after your commission, once the trip has left.
        Counter sales are not here: the company keeps that cash.
      </p>

      {totals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          {stat('Owed to companies now', totals.due, totals.due > 0 ? '#2E8B57' : '#1a1a1a')}
          {stat('Paid out so far', totals.paid)}
          {stat('Online sales', totals.gross)}
          {stat('Your commission', totals.commission)}
        </div>
      )}

      {loading && <p style={{ color: '#999', fontSize: '13px' }}>Loading...</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {companies.map((c) => (
          <Link key={c.id} href={`/admin/payouts/${c.id}`} style={{ textDecoration: 'none' }}>
            <div style={{ background: 'white', border: '1px solid #F0F0F0', borderRadius: '14px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>
                  {c.companyName}
                  {c.isDemo && <span style={{ fontSize: '11px', background: '#F3E8FF', color: '#7B3FA0', padding: '2px 8px', borderRadius: '20px', marginLeft: '8px' }}>Demo</span>}
                  {c.status === 'SUSPENDED' && <span style={{ fontSize: '11px', background: '#FFF5F5', color: '#C0392B', padding: '2px 8px', borderRadius: '20px', marginLeft: '8px' }}>Suspended</span>}
                </div>
                <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                  {c.commissionPercent}% commission · {c.tickets} paid ticket{c.tickets === 1 ? '' : 's'}
                  {c.lastPayoutAt ? ` · last paid ${formatDate(c.lastPayoutAt)}` : ' · never paid'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: c.due > 0 ? '#2E8B57' : '#1a1a1a' }}>{formatPrice(c.due)}</div>
                  <div style={{ fontSize: '11px', color: c.overpaid > 0 ? '#B7791F' : '#999' }}>
                    {c.overpaid > 0 ? `overpaid ${formatPrice(c.overpaid)}` : 'due now'}
                  </div>
                </div>
                <ChevronRight size={18} color="#CCC" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
