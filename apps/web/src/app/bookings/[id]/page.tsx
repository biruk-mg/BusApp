'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import Navbar from '@/components/Navbar'
import { formatDate, formatTime, formatPrice } from '@bus/utils'
import { Bus, MapPin, Calendar, ArrowRight, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

interface BookingDetail {
  id: string
  seatNumbers: string[]
  totalPrice: number
  status: string
  qrCode: string
  createdAt: string
  payment?: { status: string } | null
  schedule: {
    departureTime: string
    arrivalTime: string
    price: number
    route: { fromCity: string; toCity: string; estimatedDurationMin: number }
    bus: { busType: string; plateNumber: string; operator: { companyName: string } }
  }
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const res = await api.get(`/bookings/${id}`)
        setBooking(res.data.data.booking)
      } catch {
        setError('Booking not found')
        toast.error('Booking not found')
      } finally {
        setLoading(false)
      }
    }
    if (id) fetchBooking()
  }, [id, router])

  const handlePayNow = async () => {
    try {
      const res = await api.post('/payments/initialize', { bookingId: id })
      window.location.href = res.data.data.checkoutUrl
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      toast.error(error.response?.data?.error || 'Payment failed')
    }
  }

  const handleCancel = async () => {
    if (!confirm('Cancel this booking?')) return
    try {
      await api.patch(`/bookings/${id}/cancel`)
      toast.success('Booking cancelled')
      router.push('/bookings')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      toast.error(error.response?.data?.error || 'Failed to cancel')
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8' }}>
      <Navbar />
      <div style={{ textAlign: 'center', padding: '80px', color: '#999' }}>Loading your ticket...</div>
    </div>
  )

  if (error || !booking) return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8' }}>
      <Navbar />
      <div style={{ textAlign: 'center', padding: '80px' }}>
        <p style={{ color: '#999', marginBottom: '16px' }}>{error || 'Booking not found'}</p>
        <button onClick={() => router.push('/bookings')} style={{ background: '#C0392B', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer' }}>
          My Bookings
        </button>
      </div>
    </div>
  )

  const isPaid = booking.payment?.status === 'SUCCESS'
  const statusColor = booking.status === 'CONFIRMED'
    ? { bg: '#F0FFF4', color: '#2E8B57' }
    : booking.status === 'CANCELLED'
    ? { bg: '#FFF5F5', color: '#C0392B' }
    : { bg: '#FFFBEB', color: '#D4A017' }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8' }}>
      <Navbar />

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '40px 24px' }}>

        {/* E-Ticket Card */}
        <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>

          {/* Header */}
          <div style={{ background: '#1A0A0A', padding: '24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '28px', height: '28px', background: '#C0392B', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bus size={14} color="white" />
              </div>
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>
                Ethio<span style={{ color: '#C0392B' }}>Bus</span>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontWeight: 400, marginLeft: '8px' }}>E-Ticket</span>
              </span>
            </div>
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '5px 12px', borderRadius: '20px', background: statusColor.bg, color: statusColor.color }}>
              {booking.status}
            </span>
          </div>

          {/* Route */}
          <div style={{ padding: '28px', borderBottom: '1px dashed #E5E5E5' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '36px', fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>
                  {formatTime(booking.schedule.departureTime)}
                </div>
                <div style={{ fontSize: '13px', color: '#999', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={12} color="#C0392B" />
                  {booking.schedule.route.fromCity}
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <ArrowRight size={24} color="#D4A017" />
                <div style={{ fontSize: '11px', color: '#999', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'center' }}>
                  <Clock size={10} />
                  {booking.schedule.route.estimatedDurationMin} min
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '36px', fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>
                  {formatTime(booking.schedule.arrivalTime)}
                </div>
                <div style={{ fontSize: '13px', color: '#999', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                  <MapPin size={12} color="#C0392B" />
                  {booking.schedule.route.toCity}
                </div>
              </div>
            </div>
          </div>

          {/* Details */}
          <div style={{ padding: '24px 28px', borderBottom: '1px dashed #E5E5E5' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {[
                { label: 'DATE', value: formatDate(booking.schedule.departureTime), icon: <Calendar size={12} /> },
                { label: 'SEATS', value: booking.seatNumbers.join(', '), icon: null },
                { label: 'BUS TYPE', value: booking.schedule.bus.busType, icon: null },
                { label: 'OPERATOR', value: booking.schedule.bus.operator.companyName, icon: null },
                { label: 'PLATE', value: booking.schedule.bus.plateNumber, icon: null },
                { label: 'TOTAL PAID', value: formatPrice(booking.totalPrice), icon: null, highlight: true },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: '10px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {item.icon}{item.label}
                  </div>
                  <div style={{ fontSize: item.highlight ? '18px' : '14px', fontWeight: item.highlight ? 700 : 500, color: item.highlight ? '#C0392B' : '#1a1a1a' }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* QR Code */}
          <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <p style={{ fontSize: '12px', color: '#999', marginBottom: '16px' }}>Show this QR code when boarding</p>
            {booking.qrCode && (
              <img src={booking.qrCode} alt="QR Code" width={160} height={160} style={{ borderRadius: '12px', border: '1px solid #F0F0F0' }} />
            )}
            <p style={{ fontSize: '11px', color: '#bbb', marginTop: '12px', fontFamily: 'monospace' }}>
              {booking.id.slice(0, 24)}...
            </p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
          <button
            onClick={() => router.push('/bookings')}
            style={{ flex: 1, background: 'white', color: '#555', border: '1px solid #E5E5E5', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
          >
            My Bookings
          </button>

          {booking.status === 'CONFIRMED' && !isPaid && (
            <button
              onClick={handlePayNow}
              style={{ flex: 1, background: '#2E8B57', color: 'white', border: 'none', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
            >
              💳 Pay Now
            </button>
          )}

          {booking.status === 'CONFIRMED' && (
            <button
              onClick={handleCancel}
              style={{ flex: 1, background: '#FFF5F5', color: '#C0392B', border: '1px solid #FECACA', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}