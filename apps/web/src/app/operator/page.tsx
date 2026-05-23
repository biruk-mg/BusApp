'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Bus, Ticket, TrendingUp, Users, ArrowUp, Clock } from 'lucide-react'
import { formatPrice, formatTime, formatDate } from '@bus/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Analytics {
  dailyRevenue: { date: string; revenue: number; bookings: number }[]
  routeRevenue: { route: string; revenue: number; bookings: number }[]
  todayBookings: number
  todayRevenue: number
  totalRevenue: number
  totalBookings: number
}

interface ScheduleAvailability {
  id: string
  route: string
  departureTime: string
  arrivalTime: string
  price: number
  totalSeats: number
  bookedSeats: number
  availableSeats: number
  occupancyRate: number
  plateNumber: string
  busType: string
}

interface Stats {
  totalRevenue: number
  totalBookings: number
  totalBuses: number
  operatorName: string
}

export default function OperatorDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [availability, setAvailability] = useState<ScheduleAvailability[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [statsRes, analyticsRes, availabilityRes] = await Promise.all([
          api.get('/operator/stats'),
          api.get('/operator/analytics'),
          api.get('/operator/availability'),
        ])
        setStats(statsRes.data.data)
        setAnalytics(analyticsRes.data.data)
        setAvailability(availabilityRes.data.data.schedules)
      } catch (err) { console.error(err) }
      finally { setLoading(false) }
    }
    fetchAll()
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', color: '#999' }}>
      Loading dashboard...
    </div>
  )
  if (!stats || !analytics) return null

  const occupancyColor = (rate: number) => {
    if (rate >= 80) return '#C0392B'
    if (rate >= 50) return '#D4A017'
    return '#2E8B57'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1a1a1a' }}>
            Welcome, {stats.operatorName}
          </h1>
          <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>
            {new Date().toLocaleDateString('en-ET', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '10px 16px', textAlign: 'right' }}>
          <p style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>Today's Revenue</p>
          <p style={{ fontSize: '20px', fontWeight: 700, color: '#C0392B' }}>{formatPrice(analytics.todayRevenue)}</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {[
          { label: 'Total Buses', value: stats.totalBuses, icon: Bus, color: '#C0392B', bg: '#FEF2F2', change: 'Fleet size' },
          { label: "Today's Bookings", value: analytics.todayBookings, icon: Ticket, color: '#2E8B57', bg: '#F0FFF4', change: 'Last 24 hours' },
          { label: 'Total Bookings', value: stats.totalBookings, icon: Users, color: '#4169E1', bg: '#EEF2FF', change: 'All time' },
          { label: 'Total Revenue', value: formatPrice(stats.totalRevenue), icon: TrendingUp, color: '#D4A017', bg: '#FFFBEB', change: 'All time' },
        ].map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #F0F0F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <p style={{ fontSize: '12px', color: '#999' }}>{card.label}</p>
                <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} color={card.color} />
                </div>
              </div>
              <p style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', marginBottom: '4px' }}>{card.value}</p>
              <p style={{ fontSize: '11px', color: '#bbb' }}>{card.change}</p>
            </div>
          )
        })}
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '16px' }}>

        {/* Revenue Chart */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>Revenue — Last 7 Days</h2>
              <p style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>Daily booking revenue in ETB</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#2E8B57' }}>
              <ArrowUp size={14} /> Live
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={analytics.dailyRevenue} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
              <YAxis tick={{ fontSize: 11, fill: '#999' }} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: '1px solid #F0F0F0', fontSize: '12px' }}
                formatter={(value: unknown) => [formatPrice(value as number), 'Revenue']}              />
              <Bar dataKey="revenue" fill="#C0392B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Route Performance */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '24px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', marginBottom: '4px' }}>Route Performance</h2>
          <p style={{ fontSize: '12px', color: '#999', marginBottom: '20px' }}>Revenue per route (7 days)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {analytics.routeRevenue.length === 0 && (
              <p style={{ fontSize: '13px', color: '#bbb', textAlign: 'center', padding: '20px 0' }}>No data yet</p>
            )}
            {analytics.routeRevenue.map((r, i) => {
              const maxRevenue = Math.max(...analytics.routeRevenue.map(x => x.revenue))
              const pct = maxRevenue > 0 ? (r.revenue / maxRevenue) * 100 : 0
              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#555', fontWeight: 500 }}>{r.route}</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a1a1a' }}>{formatPrice(r.revenue)}</span>
                  </div>
                  <div style={{ height: '6px', background: '#F5F5F5', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: '#C0392B', borderRadius: '3px', transition: 'width 0.5s' }} />
                  </div>
                  <p style={{ fontSize: '11px', color: '#bbb', marginTop: '2px' }}>{r.bookings} bookings</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Live Schedule Availability */}
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F5F5F5', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={18} color="#C0392B" />
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>Live Schedule & Seat Availability</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FAFAFA' }}>
                {['Route', 'Date', 'Departure', 'Bus', 'Price', 'Seats Sold', 'Occupancy', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 20px', fontSize: '11px', color: '#999', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {availability.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#999', fontSize: '13px' }}>No schedules found</td></tr>
              )}
              {availability.map((s) => {
                const isPast = new Date(s.departureTime) < new Date()
                const isFullySold = s.availableSeats === 0
                return (
                  <tr key={s.id} style={{ borderTop: '1px solid #F5F5F5', opacity: isPast ? 0.6 : 1 }}>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{s.route}</span>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: '12px', color: '#666' }}>
                      {formatDate(s.departureTime)}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: '12px', color: '#666' }}>
                      {formatTime(s.departureTime)}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 500, color: '#1a1a1a' }}>{s.plateNumber}</p>
                      <p style={{ fontSize: '11px', color: '#bbb' }}>{s.busType}</p>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: '13px', fontWeight: 600, color: '#C0392B' }}>
                      {formatPrice(s.price)}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ fontSize: '13px', color: '#1a1a1a', fontWeight: 500 }}>{s.bookedSeats}</span>
                      <span style={{ fontSize: '12px', color: '#bbb' }}>/{s.totalSeats}</span>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '60px', height: '6px', background: '#F0F0F0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${s.occupancyRate}%`, background: occupancyColor(s.occupancyRate), borderRadius: '3px' }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: occupancyColor(s.occupancyRate) }}>
                          {s.occupancyRate}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px',
                        background: isPast ? '#F5F5F5' : isFullySold ? '#FEF2F2' : '#F0FFF4',
                        color: isPast ? '#999' : isFullySold ? '#C0392B' : '#2E8B57'
                      }}>
                        {isPast ? 'Departed' : isFullySold ? 'Full' : 'Available'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bookings Chart */}
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '24px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', marginBottom: '4px' }}>Daily Bookings — Last 7 Days</h2>
        <p style={{ fontSize: '12px', color: '#999', marginBottom: '20px' }}>Number of tickets booked per day</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={analytics.dailyRevenue} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
            <YAxis tick={{ fontSize: 11, fill: '#999' }} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #F0F0F0', fontSize: '12px' }}
              formatter={(value: unknown) => [value as number, 'Bookings']} />
            <Bar dataKey="bookings" fill="#1A0A0A" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  )
}