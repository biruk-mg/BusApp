'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/lib/api'
import { errorOf } from '@/lib/admin'
import { CompanySalesDetail, METHOD_LABEL, PeriodId, asPeriod } from '@/lib/sales'
import PeriodTabs from '@/components/PeriodTabs'
import { formatPrice } from '@bus/utils'
import toast from 'react-hot-toast'

const box: React.CSSProperties = { background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '20px 24px', marginBottom: '24px', overflowX: 'auto' }
const th: React.CSSProperties = { textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '8px 12px', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 12px', fontSize: '14px', color: '#1a1a1a', borderTop: '1px solid #F5F5F5', whiteSpace: 'nowrap' }
const num: React.CSSProperties = { textAlign: 'right' }
const h2: React.CSSProperties = { fontSize: '16px', fontWeight: 600, color: '#1a1a1a', marginBottom: '12px' }
const t = (n: number) => `${n} ticket${n === 1 ? '' : 's'}`

function Empty({ text }: { text: string }) {
  return <p style={{ color: '#999', fontSize: '14px' }}>{text}</p>
}

function CompanySalesScreen() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const params = useSearchParams()
  const period = asPeriod(params.get('period'))
  const [data, setData] = useState<CompanySalesDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/admin/sales/${id}`, { params: { period } })
      .then((res) => setData(res.data.data))
      .catch((err) => toast.error(errorOf(err, 'Failed to load this company')))
      .finally(() => setLoading(false))
  }, [id, period])

  useEffect(() => { load() }, [load])

  const setPeriod = (p: PeriodId) => router.replace(`/admin/sales/${id}?period=${p}`)
  const stat = (label: string, value: string, sub: string) => (
    <div style={{ background: 'white', borderRadius: '16px', padding: '18px 20px', border: '1px solid #F0F0F0' }}>
      <p style={{ fontSize: '13px', color: '#999' }}>{label}</p>
      <p style={{ fontSize: '22px', fontWeight: 700, color: '#1a1a1a', marginTop: '6px' }}>{value}</p>
      <p style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{sub}</p>
    </div>
  )

  return (
    <div>
      <Link href={`/admin/sales?period=${period}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#666', textDecoration: 'none', marginBottom: '16px' }}>
        <ArrowLeft size={14} /> All companies
      </Link>

      {loading && !data ? (
        <div style={{ color: '#999' }}>Loading...</div>
      ) : !data ? (
        <button onClick={load} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #E5E5E5', background: 'white', cursor: 'pointer' }}>Try again</button>
      ) : (
        <div style={{ opacity: loading ? 0.6 : 1 }}>
          <div style={{ marginBottom: '20px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>
              {data.company.companyName}
              {data.company.isDemo && <span style={{ marginLeft: '10px', fontSize: '11px', background: '#FFF8E5', color: '#9A6B00', padding: '3px 8px', borderRadius: '10px', verticalAlign: 'middle' }}>Demo</span>}
            </h1>
            <p style={{ fontSize: '14px', color: '#999', marginTop: '4px' }}>
              Sales after refunds · commission {data.company.commissionPercent}% ·{' '}
              <Link href={`/admin/companies/${data.company.id}`} style={{ color: '#C0392B', textDecoration: 'none' }}>Open company</Link>
              {' · '}
              <Link href={`/admin/payouts/${data.company.id}`} style={{ color: '#C0392B', textDecoration: 'none' }}>Payouts</Link>
            </p>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <PeriodTabs value={period} onChange={setPeriod} />
            <p style={{ fontSize: '12px', color: '#999', marginTop: '10px' }}>{data.from === data.to ? data.from : `${data.from} to ${data.to}`} (Addis Ababa time)</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {stat('Online sales', formatPrice(data.totals.online.total), t(data.totals.online.tickets))}
            {stat('Your commission', formatPrice(data.totals.commission), 'on the online sales')}
            {stat('Counter sales', formatPrice(data.totals.counter.total), `${t(data.totals.counter.tickets)} · the company's own cash`)}
            {stat('All sales', formatPrice(data.totals.total), 'online and counter together')}
          </div>

          <div style={box}>
            <h2 style={h2}>By route</h2>
            {data.byRoute.length === 0 ? <Empty text="No sales in this period." /> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
                <thead><tr><th style={th}>Route</th><th style={{ ...th, ...num }}>Online</th><th style={{ ...th, ...num }}>Counter</th><th style={{ ...th, ...num }}>Total</th></tr></thead>
                <tbody>
                  {data.byRoute.map((r) => (
                    <tr key={`${r.fromCity}-${r.toCity}`}>
                      <td style={td}>{r.fromCity} → {r.toCity}</td>
                      <td style={{ ...td, ...num }}>{formatPrice(r.online.total)} <span style={{ color: '#999', fontSize: '12px' }}>· {r.online.tickets}</span></td>
                      <td style={{ ...td, ...num }}>{formatPrice(r.counter.total)} <span style={{ color: '#999', fontSize: '12px' }}>· {r.counter.tickets}</span></td>
                      <td style={{ ...td, ...num, fontWeight: 700 }}>{formatPrice(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {data.byDay.length > 1 && (
            <div style={box}>
              <h2 style={h2}>By day</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
                <thead><tr><th style={th}>Day</th><th style={{ ...th, ...num }}>Online</th><th style={{ ...th, ...num }}>Counter</th><th style={{ ...th, ...num }}>Total</th></tr></thead>
                <tbody>
                  {[...data.byDay].reverse().map((d) => (
                    <tr key={d.date}>
                      <td style={td}>{d.date}</td>
                      <td style={{ ...td, ...num }}>{formatPrice(d.online.total)}</td>
                      <td style={{ ...td, ...num }}>{formatPrice(d.counter.total)}</td>
                      <td style={{ ...td, ...num, fontWeight: 700 }}>{formatPrice(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            <div style={box}>
              <h2 style={h2}>Counter sales by seller</h2>
              {data.bySeller.length === 0 ? <Empty text="No counter sales in this period." /> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Seller</th><th style={{ ...th, ...num }}>Tickets</th><th style={{ ...th, ...num }}>Total</th></tr></thead>
                  <tbody>
                    {data.bySeller.map((s) => (
                      <tr key={s.name}><td style={td}>{s.name}</td><td style={{ ...td, ...num }}>{s.tickets}</td><td style={{ ...td, ...num, fontWeight: 700 }}>{formatPrice(s.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={box}>
              <h2 style={h2}>Counter sales by payment method</h2>
              {data.counterByMethod.length === 0 ? <Empty text="No counter sales in this period." /> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Method</th><th style={{ ...th, ...num }}>Tickets</th><th style={{ ...th, ...num }}>Total</th></tr></thead>
                  <tbody>
                    {data.counterByMethod.map((m) => (
                      <tr key={m.method}><td style={td}>{METHOD_LABEL[m.method] ?? m.method}</td><td style={{ ...td, ...num }}>{m.tickets}</td><td style={{ ...td, ...num, fontWeight: 700 }}>{formatPrice(m.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminCompanySalesPage() {
  return (
    <Suspense fallback={<div style={{ color: '#999' }}>Loading...</div>}>
      <CompanySalesScreen />
    </Suspense>
  )
}
