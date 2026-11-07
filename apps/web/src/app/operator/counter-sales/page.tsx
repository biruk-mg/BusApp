'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import CounterSalesList from '@/components/CounterSalesList'
import { CounterSale, METHOD_LABEL, addisDay, errorOf } from '@/lib/counter'
import { formatPrice } from '@bus/utils'
import { Banknote } from 'lucide-react'
import toast from 'react-hot-toast'

interface Row { tickets: number; seats: number; total: number }
interface Report {
  date: string
  totals: Row
  byMethod: Record<string, Row>
  bySeller: ({ staffId: string; name: string; byMethod: Record<string, Row> } & Row)[]
  voided: Row
}

const box: React.CSSProperties = { background: 'white', border: '1px solid #F0F0F0', borderRadius: '16px', padding: '20px', marginBottom: '20px' }

export default function CounterSalesPage() {
  const [date, setDate] = useState(addisDay())
  const [report, setReport] = useState<Report | null>(null)
  const [sales, setSales] = useState<CounterSale[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, s] = await Promise.all([
        api.get('/counter/report', { params: { date } }),
        api.get('/counter/sales', { params: { date } }),
      ])
      setReport(r.data.data)
      setSales(s.data.data.sales)
    } catch (err) {
      toast.error(errorOf(err, 'Failed to load counter sales'))
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { load() }, [load])

  const voidSale = async (sale: CounterSale) => {
    const reason = window.prompt(`Void ${sale.passengerName}'s ticket? This frees the seats. Give a reason:`)
    if (!reason) return
    try {
      await api.post(`/counter/sales/${sale.id}/void`, { reason })
      toast.success('Sale voided')
      load()
    } catch (err) {
      toast.error(errorOf(err, 'Could not void this sale'))
    }
  }

  const stat = (title: string, row: Row | undefined, color = '#1a1a1a') => (
    <div style={{ flex: '1 1 150px', background: '#FAFAFA', borderRadius: '12px', padding: '14px' }}>
      <div style={{ fontSize: '11px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, color, marginTop: '4px' }}>{formatPrice(row?.total ?? 0)}</div>
      <div style={{ fontSize: '12px', color: '#999' }}>{row?.tickets ?? 0} ticket{row?.tickets === 1 ? '' : 's'} · {row?.seats ?? 0} seat{row?.seats === 1 ? '' : 's'}</div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Banknote size={22} color="#C0392B" /> Counter sales
          </h1>
          <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>
            Tickets sold at the bus station, by the day they were sold. Counter money goes straight to your own cash, Telebirr and bank accounts.
          </p>
        </div>
        <input type="date" value={date} max={addisDay()} onChange={(e) => setDate(e.target.value || addisDay())}
          style={{ border: '1px solid #E5E5E5', borderRadius: '10px', padding: '10px 14px', fontSize: '14px' }} />
      </div>

      {loading && <p style={{ color: '#999' }}>Loading...</p>}

      {!loading && report && (
        <>
          <div style={box}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {stat('Total sold', report.totals, '#C0392B')}
              {Object.entries(report.byMethod).map(([m, row]) => stat(METHOD_LABEL[m] ?? m, row))}
              {report.voided.tickets > 0 && stat('Voided (not counted)', report.voided, '#999')}
            </div>
          </div>

          <div style={box}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>By seller</h2>
            {report.bySeller.length === 0 && <p style={{ color: '#999', fontSize: '13px' }}>No sales on this day.</p>}
            {report.bySeller.map((s) => (
              <div key={s.staffId} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid #F5F5F5' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: '12px', color: '#999' }}>
                    {Object.entries(s.byMethod).map(([m, r]) => `${METHOD_LABEL[m] ?? m} ${formatPrice(r.total)}`).join(' · ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#C0392B' }}>{formatPrice(s.total)}</div>
                  <div style={{ fontSize: '12px', color: '#999' }}>{s.tickets} tickets</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && (
        <>
          <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>All sales</h2>
          <CounterSalesList sales={sales} onVoid={voidSale} showSeller />
        </>
      )}
    </div>
  )
}
