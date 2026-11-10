'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  expiresAt?: string | null
  payment?: { status: string } | null
  source?: 'ONLINE' | 'COUNTER'
  ticketCode?: string | null
  pickupPoint?: { name: string; offsetMin: number } | null
  dropoffPoint?: { name: string } | null
  schedule: {
    departureTime: string
    arrivalTime: string
    price: number
    route: { fromCity: string; toCity: string; estimatedDurationMin: number }
    bus: { busType: string; plateNumber: string; operator: { companyName: string; phone?: string } }
  }
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const expiryReloaded = useRef(false)

  const loadBooking = useCallback(async (): Promise<BookingDetail | null> => {
    try {
      const res = await api.get(`/bookings/${id}`)
      setBooking(res.data.data.booking)
      return res.data.data.booking as BookingDetail
    } catch {
      setError('Booking not found')
      toast.error('Booking not found')
      return null
    } finally {
      setLoading(false)
    }
  }, [id])

  // Ask the server to check the payment with Chapa. After coming back from the
  // payment page we retry a few times, because Chapa can take a moment.
  const checkPayment = useCallback(async (attempts: number) => {
    setConfirming(true)
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await api.post(`/payments/verify-booking/${id}`)
        const status = res.data.data?.status
        if (status === 'SUCCESS') { toast.success('Payment received!'); break }
        if (status === 'FAILED' || status === 'NO_PAYMENT') break
      } catch { /* try again */ }
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 3000))
    }
    await loadBooking()
    setConfirming(false)
  }, [id, loadBooking])

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const b = await loadBooking()
      if (!b || b.status === 'CANCELLED' || b.payment?.status === 'SUCCESS') return
      const returnedFromPayment = new URLSearchParams(window.location.search).get('payment') === 'success'
      if (returnedFromPayment) checkPayment(5)
      else if (b.payment?.status === 'PENDING') checkPayment(1)
    })()
  }, [id, loadBooking, checkPayment])

  // Clock for the seat-hold countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // When the hold runs out, reload once so the page shows the real status
  useEffect(() => {
    if (
      booking?.status === 'PENDING' && booking.expiresAt && !confirming &&
      !expiryReloaded.current && now > new Date(booking.expiresAt).getTime()
    ) {
      expiryReloaded.current = true
      loadBooking()
    }
  }, [now, booking, confirming, loadBooking])

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
  const msLeft = booking.expiresAt ? new Date(booking.expiresAt).getTime() - now : null
  const holdLabel = msLeft !== null && msLeft > 0
    ? `${Math.floor(msLeft / 60000)}:${String(Math.floor((msLeft % 60000) / 1000)).padStart(2, '0')}`
    : null
  const statusColor = booking.status === 'CONFIRMED'
    ? { bg: '#F0FFF4', color: '#2E8B57' }
    : booking.status === 'CANCELLED'
    ? { bg: '#FFF5F5', color: '#C0392B' }
    : { bg: '#FFFBEB', color: '#D4A017' }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8' }}>
      <Navbar />

      <div className="ticket-wrap" style={{ maxWidth: '600px', margin: '0 auto', padding: '40px 24px' }}>

        {booking.status === 'PENDING' && !isPaid && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', fontSize: '13px', color: '#92400E', lineHeight: 1.5 }}>
            {confirming
              ? 'Checking your payment…'
              : holdLabel
              ? <>Your seats are held for <strong>{holdLabel}</strong>. Pay now to confirm your booking.</>
              : 'Your hold on these seats is ending. Refresh to see the latest status.'}
          </div>
        )}
        {booking.status === 'CANCELLED' && !isPaid && (
          <div style={{ background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', fontSize: '13px', color: '#991B1B', lineHeight: 1.5 }}>
            This booking expired or was cancelled. Please choose your seats again.
          </div>
        )}
        {booking.source === 'COUNTER' && booking.status !== 'CANCELLED' && booking.ticketCode && (
          <div style={{ background: '#F0FFF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', fontSize: '13px', color: '#166534', lineHeight: 1.5 }}>
            This ticket was bought at the bus station and is already paid. Ticket code: <strong>{booking.ticketCode}</strong>.{' '}
            <a href={`/ticket/${booking.ticketCode}`} style={{ color: '#166534', fontWeight: 700 }}>Open ticket</a>
          </div>
        )}
        {booking.source === 'COUNTER' && booking.status === 'CANCELLED' && (
          <div style={{ background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', fontSize: '13px', color: '#991B1B', lineHeight: 1.5 }}>
            This ticket was cancelled by the bus company. Please contact them about your money.
          </div>
        )}
        {booking.source !== 'COUNTER' && booking.status === 'CANCELLED' && isPaid && (
          <div style={{ background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', fontSize: '13px', color: '#991B1B', lineHeight: 1.5 }}>
            We received your payment, but these seats were taken before it was confirmed. Please contact support to get a refund.
          </div>
        )}

        {/* E-Ticket Card */}
        <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>

          {/* Header */}
          <div className="ticket-pad" style={{ background: '#1A0A0A', padding: '24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
              {booking.status === 'PENDING' ? 'AWAITING PAYMENT' : booking.status}
            </span>
          </div>

          {/* Route */}
          <div className="ticket-pad" style={{ padding: '28px', borderBottom: '1px dashed #E5E5E5' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="ticket-time" style={{ fontSize: '36px', fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>
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
                <div className="ticket-time" style={{ fontSize: '36px', fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>
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
          <div className="ticket-pad" style={{ padding: '24px 28px', borderBottom: '1px dashed #E5E5E5' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {[
                { label: 'DATE', value: formatDate(booking.schedule.departureTime), icon: <Calendar size={12} /> },
                ...(booking.pickupPoint
                  ? [{ label: 'PICKUP', value: `${booking.pickupPoint.name} · ~${formatTime(new Date(new Date(booking.schedule.departureTime).getTime() + booking.pickupPoint.offsetMin * 60000).toISOString())}`, icon: <MapPin size={12} /> }]
                  : []),
                { label: 'DROP-OFF', value: booking.dropoffPoint ? booking.dropoffPoint.name : 'Tell the driver', icon: null },
                { label: 'SEATS', value: booking.seatNumbers.join(', '), icon: null },
                { label: 'BUS TYPE', value: booking.schedule.bus.busType, icon: null },
                { label: 'OPERATOR', value: booking.schedule.bus.operator.companyName, icon: null },
                ...(booking.schedule.bus.operator.phone ? [{ label: 'OPERATOR PHONE', value: booking.schedule.bus.operator.phone, icon: null }] : []),
                { label: 'PLATE', value: booking.schedule.bus.plateNumber, icon: null },
                { label: isPaid ? 'TOTAL PAID' : 'TOTAL DUE', value: formatPrice(booking.totalPrice), icon: null, highlight: true },
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
          <div className="ticket-pad" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {isPaid && booking.status === 'CONFIRMED' ? (
              <>
                <p style={{ fontSize: '12px', color: '#999', marginBottom: '16px' }}>Show this QR code when boarding</p>
                {booking.qrCode && (
                  <img src={booking.qrCode} alt="QR Code" width={160} height={160} style={{ borderRadius: '12px', border: '1px solid #F0F0F0' }} />
                )}
              </>
            ) : (
              <p style={{ fontSize: '13px', color: '#999', textAlign: 'center', padding: '12px 0' }}>
                Your boarding QR code appears here once payment is confirmed.
              </p>
            )}
            {isPaid && booking.status === 'CONFIRMED' && booking.ticketCode ? (
              <p style={{ fontSize: '12px', color: '#999', marginTop: '14px', textAlign: 'center' }}>
                Ticket code
                <span style={{ display: 'block', fontSize: '22px', fontWeight: 700, color: '#1a1a1a', fontFamily: 'monospace', letterSpacing: '3px', marginTop: '2px' }}>
                  {booking.ticketCode}
                </span>
                <span style={{ display: 'block', marginTop: '2px' }}>If the QR code does not scan, read this code to the checker.</span>
              </p>
            ) : (
              <p style={{ fontSize: '11px', color: '#bbb', marginTop: '12px', fontFamily: 'monospace' }}>
                {booking.id.slice(0, 24)}...
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="ticket-actions" style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
          <button
            onClick={() => router.push('/bookings')}
            style={{ flex: 1, background: 'white', color: '#555', border: '1px solid #E5E5E5', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
          >
            My Bookings
          </button>

          {booking.status !== 'CANCELLED' && !isPaid && (
            <button
              onClick={handlePayNow}
              disabled={confirming}
              style={{ flex: 1, background: '#2E8B57', color: 'white', border: 'none', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, cursor: confirming ? 'default' : 'pointer', opacity: confirming ? 0.6 : 1 }}
            >
              💳 Pay Now
            </button>
          )}

          {booking.source !== 'COUNTER' && (booking.status === 'CONFIRMED' || booking.status === 'PENDING') && (
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