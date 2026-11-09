'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import AttentionList from '@/components/AttentionList'
import { AttentionItem, Totals, errorOf } from '@/lib/admin'
import { Building2, Users, Ticket, Banknote, Globe, CalendarClock } from 'lucide-react'
import { formatPrice, formatDate, formatTime } from '@bus/utils'
import toast from 'react-hot-toast'

interface RecentBooking {
  id: string
  source: 'ONLINE' | 'COUNTER'
  status: string
  totalPrice: number
  createdAt: string
  passengerName: string | null
  passengerPhone: string | null
  companyName: string
  fromCity: string
  toCity: string
  departureTime: string
}

interface Dashboard {
  companies: { total: number; active: number; suspended: number; demo: number }
  passengers: number
  upcomingTrips: number
  today: { online: Totals; counter: Totals }
  last30: { online: Totals; counter: Totals }
  attention: { total: number; high: number; items: AttentionItem[] }
  recentBookings: RecentBooking[]
}

const statusStyle = (status: string) =>
  status === 'CONFIRMED' || status === 'COMPLETED' ? { bg: '#F0FFF4', color: '#2E8B57' }
  : status === 'CANCELLED' ? { bg: '#FFF5F5', color: '#C0392B' }
  : { bg: '#FFFBEB', color: '#D4A017' }

const box: React.CSSProperties = { background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '20px 24px', marginBottom: '24px' }

export default function AdminDashboard() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/dashboard')
      .then((res) => setData(res.data.data))
      .catch((err) => toast.error(errorOf(err, 'Failed to load the dashboard')))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ color: '#999' }}>Loading dashboard...</div>
  if (!data) return null

  const card = (label: string, value: string | number, sub: string, Icon: typeof Ticket, color: string, bg: string) => (
    <div key={label} style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #F0F0F0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <p style={{ fontSize: '13px', color: '#999' }}>{label}</p>
        <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={17} color={color} />
        </div>
      </div>
      <p style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>{value}</p>
      <p style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{sub}</p>
    </div>
  )

  const t = (x: Totals) => `${x.tickets} ticket${x.tickets === 1 ? '' : 's'}`

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>Dashboard</h1>
        <p style={{ fontSize: '14px', color: '#999', marginTop: '4px' }}>Platform overview. Demo companies are not counted.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {card('Companies', data.companies.active, `${data.companies.suspended} suspended · ${data.companies.demo} demo`, Building2, '#C0392B', '#FEF2F2')}
        {card('Passengers', data.passengers, 'registered accounts', Users, '#4169E1', '#EEF2FF')}
        {card('Online sales today', formatPrice(data.today.online.total), `${t(data.today.online)} · 30 days: ${formatPrice(data.last30.online.total)}`, Globe, '#2E8B57', '#F0FFF4')}
        {card('Counter sales today', formatPrice(data.today.counter.total), `${t(data.today.counter)} · 30 days: ${formatPrice(data.last30.counter.total)}`, Banknote, '#D4A017', '#FFFBEB')}
        {card('Trips, next 7 days', data.upcomingTrips, 'open for booking', CalendarClock, '#555', '#F5F5F5')}
      </div>

      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a' }}>
            Needs attention {data.attention.total > 0 && <span style={{ color: '#C0392B' }}>({data.attention.total})</span>}
          </h2>
          <Link href="/admin/companies" style={{ fontSize: '13px', color: '#C0392B', fontWeight: 600, textDecoration: 'none' }}>All companies →</Link>
        </div>
        <AttentionList items={data.attention.items} total={data.attention.total} />
      </div>

      <div style={{ ...box, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F5F5F5', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Ticket size={18} color="#C0392B" />
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a' }}>Recent bookings</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
            <thead>
              <tr style={{ background: '#FAFAFA' }}>
                {['Passenger', 'Company', 'Trip', 'Amount', 'Status'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 24px', fontSize: '12px', color: '#999', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.recentBookings.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#999', fontSize: '14px' }}>No bookings yet.</td></tr>
              )}
              {data.recentBookings.map((b) => {
                const s = statusStyle(b.status)
                return (
                  <tr key={b.id} style={{ borderTop: '1px solid #F5F5F5' }}>
                    <td style={{ padding: '14px 24px' }}>
                      <p style={{ fontSize: '14px', fontWeight: 500, color: '#1a1a1a' }}>
                        {b.passengerName ?? '—'}
                        {b.source === 'COUNTER' && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#FFF8E5', color: '#9A6B00', padding: '2px 6px', borderRadius: '10px' }}>Counter</span>}
                      </p>
                      <p style={{ fontSize: '12px', color: '#bbb' }}>{b.passengerPhone ?? ''}</p>
                    </td>
                    <td style={{ padding: '14px 24px', fontSize: '13px', color: '#555' }}>{b.companyName}</td>
                    <td style={{ padding: '14px 24px', fontSize: '13px', color: '#555' }}>
                      {b.fromCity} → {b.toCity}
                      <div style={{ fontSize: '11px', color: '#bbb' }}>{formatDate(b.departureTime)} {formatTime(b.departureTime)}</div>
                    </td>
                    <td style={{ padding: '14px 24px', fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>{formatPrice(b.totalPrice)}</td>
                    <td style={{ padding: '14px 24px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', background: s.bg, color: s.color }}>{b.status}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
