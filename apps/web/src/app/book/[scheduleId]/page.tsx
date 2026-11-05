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

interface PointOption {
  id: string
  name: string
  sequence: number
  offsetMin: number
}

// A list of places to choose from, each with the estimated time the bus is there
function PointPicker({ points, value, onChange, departure, noneLabel }: {
  points: PointOption[]
  value: string
  onChange: (id: string) => void
  departure: string
  noneLabel?: string
}) {
  const row = (selected: boolean) => ({
    display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left' as const,
    padding: '12px 14px', borderRadius: '12px', cursor: 'pointer',
    border: selected ? '2px solid #C0392B' : '1px solid #E5E5E5',
    background: selected ? '#FFF5F5' : 'white',
  })
  const dot = (selected: boolean) => ({
    width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
    border: selected ? '5px solid #C0392B' : '2px solid #CCC', background: 'white',
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {noneLabel && (
        <button type="button" onClick={() => onChange('')} style={row(value === '')}>
          <span style={dot(value === '')} />
          <span style={{ fontSize: '14px', color: '#555' }}>{noneLabel}</span>
        </button>
      )}
      {points.map((p) => {
        const selected = value === p.id
        const at = new Date(new Date(departure).getTime() + p.offsetMin * 60000).toISOString()
        return (
          <button type="button" key={p.id} onClick={() => onChange(p.id)} style={row(selected)}>
            <span style={dot(selected)} />
            <span style={{ flex: 1, fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>{p.name}</span>
            <span style={{ fontSize: '12px', color: '#999', whiteSpace: 'nowrap' }}>~{formatTime(at)}</span>
          </button>
        )
      })}
    </div>
  )
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
  const [pickupPoints, setPickupPoints] = useState<PointOption[]>([])
  const [dropoffPoints, setDropoffPoints] = useState<PointOption[]>([])
  const [pickupId, setPickupId] = useState('')
  const [dropoffId, setDropoffId] = useState('')

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
        const seatsRes = await api.get(`/schedules/${scheduleId}/seats`)
        setBookedSeats(seatsRes.data.data.bookedSeats)
        setPickupPoints(seatsRes.data.data.pickupPoints ?? [])
        setDropoffPoints(seatsRes.data.data.dropoffPoints ?? [])
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

  const pickupMissing = pickupPoints.length > 0 && !pickupId
  const canBook = selectedSeats.length === passengers && !pickupMissing

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
    if (pickupPoints.length > 0 && !pickupId) { toast.error('Please choose your pickup point'); return }
    if (selectedSeats.length !== passengers) { toast.error(`Select exactly ${passengers} seat${passengers > 1 ? 's' : ''}`); return }
    setBooking(true)
    try {
      const res = await api.post('/bookings', {
        scheduleId,
        seatNumbers: selectedSeats,
        pickupPointId: pickupId || undefined,
        dropoffPointId: dropoffId || undefined,
      })
      toast.success('Seats reserved. Complete your payment to confirm.')
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
      <div className="hero-pad" style={{ background: '#1A0A0A', padding: '28px 80px' }}>
        <div className="book-head" style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div>
              <div className="trip-time" style={{ fontSize: '28px', fontWeight: 700, color: 'white' }}>{formatTime(schedule.departureTime)}</div>
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
              <div className="trip-time" style={{ fontSize: '28px', fontWeight: 700, color: 'white' }}>{formatTime(schedule.arrivalTime)}</div>
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

      <div className="page-pad" style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 80px' }}>
        {/* Pickup point (required when the operator has pickup points) */}
        {pickupPoints.length > 0 && (
          <div className="seat-card" style={{ background: 'white', borderRadius: '16px', border: '1px solid #EEEEEE', padding: '28px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>
              Where will you board? <span style={{ color: '#C0392B' }}>*</span>
            </h2>
            <p style={{ fontSize: '13px', color: '#999', margin: '4px 0 16px' }}>
              Choose your pickup point. Times are estimates, so please be there 10–15 minutes early.
            </p>
            <PointPicker points={pickupPoints} value={pickupId} onChange={setPickupId} departure={schedule.departureTime} />
          </div>
        )}

        {/* Seat Map */}
        <div className="seat-card" style={{ background: 'white', borderRadius: '16px', border: '1px solid #EEEEEE', padding: '28px', marginBottom: '20px' }}>
          <div className="seat-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>Select {passengers} Seat{passengers > 1 ? 's' : ''}</h2>
              <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>{selectedSeats.length} of {passengers} selected</p>
            </div>
            {/* Legend */}
            <div className="seat-legend" style={{ display: 'flex', gap: '16px' }}>
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
<div className="seat-grid" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '260px' }}>
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

        {/* Drop-off point (optional) */}
        {dropoffPoints.length > 0 && (
          <div className="seat-card" style={{ background: 'white', borderRadius: '16px', border: '1px solid #EEEEEE', padding: '28px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>
              Where do you want to get off? <span style={{ fontSize: '13px', fontWeight: 500, color: '#999' }}>(optional)</span>
            </h2>
            <p style={{ fontSize: '13px', color: '#999', margin: '4px 0 16px' }}>
              You can also ask the driver to stop along the way.
            </p>
            <PointPicker points={dropoffPoints} value={dropoffId} onChange={setDropoffId} departure={schedule.arrivalTime} noneLabel="I'll tell the driver" />
          </div>
        )}

        {/* Confirm Button */}
        <button
          className="confirm-btn"
          onClick={handleBook}
          disabled={booking || !canBook}
          style={{
            width: '100%', background: canBook ? '#C0392B' : '#E0E0E0',
            color: canBook ? 'white' : '#999',
            border: 'none', borderRadius: '12px', padding: '16px',
            fontSize: '16px', fontWeight: 700, cursor: canBook ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
          }}
        >
          {booking ? 'Reserving...' : pickupMissing
            ? 'Choose your pickup point'
            : selectedSeats.length === passengers
            ? `Reserve Seats — ${formatPrice(schedule.price * passengers)}`
            : `Select ${passengers - selectedSeats.length} more seat${passengers - selectedSeats.length > 1 ? 's' : ''}`
          }
        </button>
      </div>
    </div>
  )
}