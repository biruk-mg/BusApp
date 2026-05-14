'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import Navbar from '@/components/Navbar'
import toast from 'react-hot-toast'
import { formatTime, formatPrice, generateSeatMap } from '@bus/utils'
import { MapPin, Clock, ArrowRight } from 'lucide-react'

interface ScheduleDetail {
  id: string
  price: number
  departureTime: string
  arrivalTime: string
  route: { fromCity: string; toCity: string; estimatedDurationMin: number }
  bus: { totalSeats: number; busType: string; plateNumber: string }
  availableSeats: number
  _count: { bookings: number }
}

interface BookingSeat {
  scheduleId: string
  status: string
  seatNumbers: string[]
}

export default function BookPage() {
  const { scheduleId } = useParams<{ scheduleId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isAuthenticated, loadFromStorage } = useAuthStore()
  const passengers = Number(searchParams.get('passengers')) || 1

  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSeats, setSelectedSeats] = useState<string[]>([])
  const [bookedSeats, setBookedSeats] = useState<string[]>([])
  const [booking, setBooking] = useState(false)

  useEffect(() => {
    loadFromStorage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        const allRes = await api.get('/schedules')
        const found = allRes.data.data.schedules.find((s: ScheduleDetail) => s.id === scheduleId)
        if (found) setSchedule(found)
        const bookingsRes = await api.get('/bookings/my').catch(() => ({ data: { data: { bookings: [] } } }))
        const booked = bookingsRes.data.data.bookings
          .filter((b: BookingSeat) => b.scheduleId === scheduleId && b.status !== 'CANCELLED')
          .flatMap((b: BookingSeat) => b.seatNumbers)
        setBookedSeats(booked)
      } catch { toast.error('Failed to load schedule') }
      finally { setLoading(false) }
    }
    fetchSchedule()
  }, [scheduleId])

  const allSeats = schedule
  ? Array.from({ length: schedule.bus.totalSeats }, (_, i) =>
      String(i + 1).padStart(2, '0')
    )
  : []

  const toggleSeat = (seat: string) => {
    if (bookedSeats.includes(seat)) return
    if (selectedSeats.includes(seat)) {
      setSelectedSeats(selectedSeats.filter(s => s !== seat))
    } else {
      if (selectedSeats.length >= passengers) {
        toast.error(`Select exactly ${passengers} seat${passengers > 1 ? 's' : ''}`)
        return
      }
      setSelectedSeats([...selectedSeats, seat])
    }
  }

  const handleBook = async () => {
    if (!isAuthenticated) { toast.error('Please login'); router.push('/login'); return }
    if (selectedSeats.length !== passengers) { toast.error(`Select exactly ${passengers} seat${passengers > 1 ? 's' : ''}`); return }
    setBooking(true)
    try {
      const res = await api.post('/bookings', { scheduleId, seatNumbers: selectedSeats })
      toast.success('Booking confirmed!')
      router.push(`/bookings/${res.data.data.booking.id}`)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      toast.error(error.response?.data?.error || 'Booking failed')
    } finally { setBooking(false) }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8' }}>
      <Navbar />
      <div style={{ textAlign: 'center', padding: '80px', color: '#999' }}>Loading...</div>
    </div>
  )

  if (!schedule) return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8' }}>
      <Navbar />
      <div style={{ textAlign: 'center', padding: '80px', color: '#999' }}>Schedule not found</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8' }}>
      <Navbar />

      {/* Dark Header */}
      <div style={{ background: '#1A0A0A', padding: '28px 80px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'white' }}>{formatTime(schedule.departureTime)}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                <MapPin size={10} />{schedule.route.fromCity}
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '0 12px' }}>
              <ArrowRight size={20} color="#D4A017" />
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Clock size={10} />{schedule.route.estimatedDurationMin} min
              </div>
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'white' }}>{formatTime(schedule.arrivalTime)}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                <MapPin size={10} />{schedule.route.toCity}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#D4A017' }}>{formatPrice(schedule.price * passengers)}</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{formatPrice(schedule.price)} × {passengers}</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 80px' }}>
        {/* Seat Map */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #EEEEEE', padding: '28px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>Select {passengers} Seat{passengers > 1 ? 's' : ''}</h2>
              <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>{selectedSeats.length} of {passengers} selected</p>
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', gap: '16px' }}>
              {[
                { color: '#F5F5F5', border: '1px solid #E0E0E0', label: 'Available' },
                { color: '#C0392B', border: 'none', label: 'Selected' },
                { color: '#CCCCCC', border: 'none', label: 'Booked' },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: l.color, border: l.border }} />
                  <span style={{ fontSize: '12px', color: '#999' }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bus Front */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', padding: '10px 16px', background: '#1A0A0A', borderRadius: '8px', width: 'fit-content' }}>
            <span style={{ fontSize: '14px' }}>🚌</span>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>Driver — Front</span>
          </div>

          {/* Seats — Real Bus Layout */}
<div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '260px' }}>
  {Array.from({ length: Math.ceil(allSeats.length / 4) }, (_, rowIndex) => {
    const left1 = allSeats[rowIndex * 4]
    const left2 = allSeats[rowIndex * 4 + 1]
    const right1 = allSeats[rowIndex * 4 + 2]
    const right2 = allSeats[rowIndex * 4 + 3]

    const SeatBtn = ({ seat }: { seat: string | undefined }) => {
      if (!seat) return <div style={{ width: '44px', height: '44px' }} />
      const isBooked = bookedSeats.includes(seat)
      const isSelected = selectedSeats.includes(seat)
      return (
        <button
          onClick={() => toggleSeat(seat)}
          disabled={isBooked}
          style={{
            width: '44px', height: '44px', borderRadius: '8px',
            fontSize: '12px', fontWeight: 600,
            cursor: isBooked ? 'not-allowed' : 'pointer',
            border: isSelected ? 'none' : '1px solid #E0E0E0',
            background: isBooked ? '#CCCCCC' : isSelected ? '#C0392B' : '#F8F8F8',
            color: isBooked ? '#999' : isSelected ? 'white' : '#555',
            transition: 'all 0.15s',
            flexShrink: 0,
          }}
        >
          {seat}
        </button>
      )
    }

    const isDoorRow = rowIndex === Math.floor(Math.ceil(allSeats.length / 4) / 2)

    return (
      <div key={rowIndex}>
        {isDoorRow && (
          <div style={{ display: 'flex', alignItems: 'right', gap: '8px', marginBottom: '8px' }}>
            <div style={{ flex: 1, height: '1px', background: '#E5E5E5' }} />
            <span style={{ fontSize: '11px', color: '#C0392B', fontWeight: 600 }}>🚪 Door</span>
            <div style={{ flex: 1, height: '1px', background: '#E5E5E5' }} />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SeatBtn seat={left1} />
          <SeatBtn seat={left2} />
          {/* Aisle */}
          <div style={{ width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '1px', height: '32px', background: '#F0F0F0' }} />
          </div>
          <SeatBtn seat={right1} />
          <SeatBtn seat={right2} />
        </div>
      </div>
    )
  })}
</div>
        </div>

        {/* Confirm Button */}
        <button
          onClick={handleBook}
          disabled={booking || selectedSeats.length !== passengers}
          style={{
            width: '100%', background: selectedSeats.length === passengers ? '#C0392B' : '#E0E0E0',
            color: selectedSeats.length === passengers ? 'white' : '#999',
            border: 'none', borderRadius: '12px', padding: '16px',
            fontSize: '16px', fontWeight: 700, cursor: selectedSeats.length === passengers ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
          }}
        >
          {booking ? 'Confirming...' : selectedSeats.length === passengers
            ? `Confirm Booking — ${formatPrice(schedule.price * passengers)}`
            : `Select ${passengers - selectedSeats.length} more seat${passengers - selectedSeats.length > 1 ? 's' : ''}`
          }
        </button>
      </div>
    </div>
  )
}