'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import Navbar from '@/components/Navbar'
import { formatDate, formatTime, formatPrice } from '@bus/utils'
import { Bus, Calendar, MapPin, Ticket, ArrowRight } from 'lucide-react'

interface Booking {
  id: string
  seatNumbers: string[]
  totalPrice: number
  status: string
  createdAt: string
  schedule: {
    departureTime: string
    arrivalTime: string
    price: number
    route: { fromCity: string; toCity: string }
    bus: { busType: string; plateNumber: string }
  }
}

export default function BookingsPage() {
  const router = useRouter()
  const { isAuthenticated, loadFromStorage } = useAuthStore()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFromStorage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    const fetchBookings = async () => {
      try {
        const res = await api.get('/bookings/my')
        setBookings(res.data.data.bookings)
      } catch {
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }
    fetchBookings()
  }, [isAuthenticated, router])

  const statusStyle = (status: string) => {
    if (status === 'CONFIRMED') return { bg: '#F0FFF4', color: '#2E8B57' }
    if (status === 'CANCELLED') return { bg: '#FFF5F5', color: '#C0392B' }
    if (status === 'COMPLETED') return { bg: '#F5F5F5', color: '#666' }
    return { bg: '#FFFBEB', color: '#D4A017' }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8' }}>
      <Navbar />

      {/* Dark Header */}
      <div style={{ background: '#1A0A0A', padding: '32px 80px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <Ticket size={22} color="#C0392B" />
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>My Bookings</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
            {bookings.length} booking{bookings.length !== 1 ? 's' : ''} found
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 80px' }}>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <Bus size={40} color="#E0E0E0" style={{ display: 'block', margin: '0 auto 12px' }} />
            <p style={{ color: '#999' }}>Loading bookings...</p>
          </div>
        )}

        {/* Empty */}
        {!loading && bookings.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <Ticket size={48} color="#E0E0E0" style={{ display: 'block', margin: '0 auto 16px' }} />
            <p style={{ color: '#999', marginBottom: '20px', fontSize: '15px' }}>No bookings yet</p>
            <button
              onClick={() => router.push('/')}
              style={{ background: '#C0392B', color: 'white', border: 'none', padding: '12px 28px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              Book a Trip
            </button>
          </div>
        )}

        {/* Bookings List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {bookings.map((booking) => {
            const s = statusStyle(booking.status)
            return (
              <div
                key={booking.id}
                onClick={() => router.push(`/bookings/${booking.id}`)}
                style={{ background: 'white', borderRadius: '16px', border: '1px solid #EEEEEE', padding: '24px 28px', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                {/* Top Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MapPin size={14} color="#C0392B" />
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a' }}>
                      {booking.schedule.route.fromCity}
                    </span>
                    <ArrowRight size={14} color="#D4A017" />
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a' }}>
                      {booking.schedule.route.toCity}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '20px', background: s.bg, color: s.color }}>
                    {booking.status}
                  </span>
                </div>

                {/* Middle Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#666' }}>
                    <Calendar size={14} color="#999" />
                    {formatDate(booking.schedule.departureTime)}
                  </div>
                  <div style={{ fontSize: '13px', color: '#666' }}>
                    {formatTime(booking.schedule.departureTime)} → {formatTime(booking.schedule.arrivalTime)}
                  </div>
                  <div style={{ fontSize: '13px', color: '#666' }}>
                    Seats: <span style={{ fontWeight: 600, color: '#1a1a1a' }}>{booking.seatNumbers.join(', ')}</span>
                  </div>
                </div>

                {/* Bottom Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '16px', borderTop: '1px solid #F5F5F5' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ background: '#FEF2F2', color: '#C0392B', fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px' }}>
                      {booking.schedule.bus.busType}
                    </span>
                    <span style={{ fontSize: '12px', color: '#bbb' }}>{booking.schedule.bus.plateNumber}</span>
                  </div>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#C0392B' }}>
                    {formatPrice(booking.totalPrice)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}