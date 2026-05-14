'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Ticket } from 'lucide-react'
import { formatDate, formatTime, formatPrice } from '@bus/utils'
import toast from 'react-hot-toast'

interface Booking {
  id: string
  seatNumbers: string[]
  totalPrice: number
  status: string
  user: { name: string; phone: string }
  schedule: {
    departureTime: string
    route: { fromCity: string; toCity: string }
    bus: { plateNumber: string }
  }
}

export default function OperatorBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const res = await api.get('/operator/bookings')
        setBookings(res.data.data.bookings)
        setTotalRevenue(res.data.data.totalRevenue)
      } catch { toast.error('Failed to load bookings') }
      finally { setLoading(false) }
    }
    fetchBookings()
  }, [])

  const statusStyle = (status: string) => {
    if (status === 'CONFIRMED') return { bg: '#F0FFF4', color: '#2E8B57' }
    if (status === 'CANCELLED') return { bg: '#FFF5F5', color: '#C0392B' }
    return { bg: '#F5F5F5', color: '#666' }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Ticket size={22} color="#C0392B" /> Bookings
          </h1>
          <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>{bookings.length} total bookings</p>
        </div>
        <div style={{ background: 'white', border: '1px solid #F0F0F0', borderRadius: '12px', padding: '12px 20px' }}>
          <p style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>Total Revenue</p>
          <p style={{ fontSize: '18px', fontWeight: 700, color: '#C0392B' }}>{formatPrice(totalRevenue)}</p>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFAFA' }}>
              {['Passenger', 'Route', 'Date', 'Seats', 'Amount', 'Status'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '14px 20px', fontSize: '12px', color: '#999', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Loading...</td></tr>}
            {bookings.map((booking) => {
              const s = statusStyle(booking.status)
              return (
                <tr key={booking.id} style={{ borderTop: '1px solid #F5F5F5' }}>
                  <td style={{ padding: '14px 20px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{booking.user.name}</p>
                    <p style={{ fontSize: '11px', color: '#bbb' }}>{booking.user.phone}</p>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: '13px', color: '#555' }}>
                    {booking.schedule.route.fromCity} → {booking.schedule.route.toCity}
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <p style={{ fontSize: '12px', color: '#555' }}>{formatDate(booking.schedule.departureTime)}</p>
                    <p style={{ fontSize: '11px', color: '#bbb' }}>{formatTime(booking.schedule.departureTime)}</p>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: '13px', color: '#555' }}>{booking.seatNumbers.join(', ')}</td>
                  <td style={{ padding: '14px 20px', fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{formatPrice(booking.totalPrice)}</td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', background: s.bg, color: s.color }}>{booking.status}</span>
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