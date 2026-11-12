'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { errorOf } from '@/lib/admin'
import { PeriodId, SalesOverview, asPeriod } from '@/lib/sales'
import PeriodTabs from '@/components/PeriodTabs'
import { formatPrice } from '@bus/utils'
import toast from 'react-hot-toast'

const box: React.CSSProperties = { background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '20px 24px', marginBottom: '24px' }
const th: React.CSSProperties = { textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '10px 12px', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '12px', fontSize: '14px', color: '#1a1a1a', borderTop: '1px solid #F5F5F5', whiteSpace: 'nowrap' }
const num: React.CSSProperties = { textAlign: 'right' }

const t = (n: number) => `${n} ticket${n === 1 ? '' : 's'}`

function SalesOverviewScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const period = asPeriod(params.get('period'))
  const [data, setData] = useState<SalesOverview | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/admin/sales', { params: { period } })
      .then((res) => setData(res.data.data))
      .catch((err) => toast.error(errorOf(err, 'Failed to load the sales')))
      .finally(() => setLoading(false))
  }, [period])

  useEffect(() => { load() }, [load])

  const setPeriod = (p: PeriodId) => router.replace(`/admin/sales?period=${p}`)
  const stat = (label: string, value: string, sub: string) => (
    <div style={{ background: 'white', borderRadius: '16px', padding: '18px 20px', border: '1px solid #F0F0F0' }}>
      <p style={{ fontSize: '13px', color: '#999' }}>{label}</p>
      <p style={{ fontSize: '22px', fontWeight: 700, color: '#1a1a1a', marginTop: '6px' }}>{value}</p>
      <p style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{sub}</p>
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>Sales by company</h1>
        <p style={{ fontSize: '14px', color: '#999', marginTop: '4px' }}>
          After refunds. Demo companies are not counted. Online and counter sales are kept apart: only online sales earn you commission.
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <PeriodTabs value={period} onChange={setPeriod} />
        {data && <p style={{ fontSize: '12px', color: '#999', marginTop: '10px' }}>{data.from === data.to ? data.from : `${data.from} to ${data.to}`} (Addis Ababa time)</p>}
      </div>

      {loading && !data ? (
        <div style={{ color: '#999' }}>Loading sales...</div>
      ) : !data ? (
        <button onClick={load} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #E5E5E5', background: 'white', cursor: 'pointer' }}>Try again</button>
      ) : (
        <div style={{ opacity: loading ? 0.6 : 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {stat('Online sales', formatPrice(data.totals.online.total), t(data.totals.online.tickets))}
            {stat('Your commission', formatPrice(data.totals.commission), 'on the online sales')}
            {stat('Counter sales', formatPrice(data.totals.counter.total), `${t(data.totals.counter.tickets)} · the companies' own cash`)}
            {stat('All sales', formatPrice(data.totals.total), 'online and counter together')}
          </div>

          <div style={{ ...box, padding: 0, overflowX: 'auto' }}>
            {data.companies.length === 0 ? (
              <p style={{ padding: '24px', color: '#999', fontSize: '14px' }}>There are no companies yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
                <thead>
                  <tr>
                    <th style={th}>Company</th>
                    <th style={{ ...th, ...num }}>Online</th>
                    <th style={{ ...th, ...num }}>Counter</th>
                    <th style={{ ...th, ...num }}>Total</th>
                    <th style={{ ...th, ...num }}>Your commission</th>
                    <th style={{ ...th, ...num }}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {data.companies.map((c) => (
                    <tr key={c.id}>
                      <td style={td}>
                        <Link href={`/admin/sales/${c.id}?period=${period}`} style={{ color: '#C0392B', fontWeight: 600, textDecoration: 'none' }}>{c.companyName}</Link>
                        {c.status === 'SUSPENDED' && <span style={{ marginLeft: '8px', fontSize: '10px', background: '#FFF5F5', color: '#C0392B', padding: '2px 6px', borderRadius: '10px' }}>Suspended</span>}
                      </td>
                      <td style={{ ...td, ...num }}>{formatPrice(c.online.total)} <span style={{ color: '#999', fontSize: '12px' }}>· {c.online.tickets}</span></td>
                      <td style={{ ...td, ...num }}>{formatPrice(c.counter.total)} <span style={{ color: '#999', fontSize: '12px' }}>· {c.counter.tickets}</span></td>
                      <td style={{ ...td, ...num, fontWeight: 700 }}>{formatPrice(c.total)}</td>
                      <td style={{ ...td, ...num }}>{formatPrice(c.commission)}</td>
                      <td style={{ ...td, ...num }}>{c.share}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminSalesPage() {
  return (
    <Suspense fallback={<div style={{ color: '#999' }}>Loading sales...</div>}>
      <SalesOverviewScreen />
    </Suspense>
  )
}
