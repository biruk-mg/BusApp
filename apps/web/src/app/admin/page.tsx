'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Bus, Users, Ticket, MapPin, TrendingUp } from 'lucide-react'
import { formatPrice } from '@bus/utils'

interface RecentBooking {
  id: string
  totalPrice: number
  status: string
  createdAt: string
  user: { name: string; phone: string }
  schedule: {
    route: { fromCity: string; toCity: string }
    departureTime: string
  }
}

interface Stats {
  totalRoutes: number
  totalBookings: number
  totalRevenue: number
  recentBookings: RecentBooking[]
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [routesRes, bookingsRes] = await Promise.all([
          api.get('/routes'),
          api.get('/bookings'),
        ])
        const bookings = bookingsRes.data.data.bookings
        const totalRevenue = bookings
          .filter((b: { status: string }) => b.status === 'CONFIRMED')
          .reduce((sum: number, b: { totalPrice: number }) => sum + b.totalPrice, 0)

        setStats({
          totalRoutes: routesRes.data.data.total,
          totalBookings: bookingsRes.data.data.total,
          totalRevenue,
          recentBookings: bookings.slice(0, 5),
        })
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  if (loading) return <div style={{ color: '#999' }}>Loading dashboard...</div>
  if (!stats) return null

  const statCards = [
    { label: 'Total Routes', value: stats.totalRoutes, icon: MapPin, color: '#C0392B', bg: '#FEF2F2' },
    { label: 'Total Bookings', value: stats.totalBookings, icon: Ticket, color: '#2E8B57', bg: '#F0FFF4' },
    { label: 'Total Revenue', value: formatPrice(stats.totalRevenue), icon: TrendingUp, color: '#D4A017', bg: '#FFFBEB' },
    { label: 'Active Users', value: '—', icon: Users, color: '#4169E1', bg: '#EEF2FF' },
  ]

  const statusColor = (status: string) => {
    if (status === 'CONFIRMED') return { bg: '#F0FFF4', color: '#2E8B57' }
    if (status === 'CANCELLED') return { bg: '#FFF5F5', color: '#C0392B' }
    return { bg: '#FFFBEB', color: '#D4A017' }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>Dashboard</h1>
        <p style={{ fontSize: '14px', color: '#999', marginTop: '4px' }}>Welcome back! Here's your platform overview.</p>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #F0F0F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', color: '#999' }}>{card.label}</p>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} color={card.color} />
                </div>
              </div>
              <p style={{ fontSize: '26px', fontWeight: 700, color: '#1a1a1a' }}>{card.value}</p>
            </div>
          )
        })}
      </div>

      {/* Recent Bookings */}
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F5F5F5', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Ticket size={18} color="#C0392B" />
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a' }}>Recent Bookings</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFAFA' }}>
              {['Passenger', 'Route', 'Amount', 'Status'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '12px 24px', fontSize: '12px', color: '#999', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.recentBookings.map((booking) => {
              const s = statusColor(booking.status)
              return (
                <tr key={booking.id} style={{ borderTop: '1px solid #F5F5F5' }}>
                  <td style={{ padding: '14px 24px' }}>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: '#1a1a1a' }}>{booking.user.name}</p>
                    <p style={{ fontSize: '12px', color: '#bbb' }}>{booking.user.phone}</p>
                  </td>
                  <td style={{ padding: '14px 24px', fontSize: '13px', color: '#555' }}>
                    {booking.schedule.route.fromCity} → {booking.schedule.route.toCity}
                  </td>
                  <td style={{ padding: '14px 24px', fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>
                    {formatPrice(booking.totalPrice)}
                  </td>
                  <td style={{ padding: '14px 24px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', background: s.bg, color: s.color }}>
                      {booking.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}