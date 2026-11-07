'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import StaffShell from '@/components/StaffShell'
import CounterSalesList from '@/components/CounterSalesList'
import { api } from '@/lib/api'
import { CounterSale, METHOD_LABEL, addisDay, errorOf } from '@/lib/counter'
import { formatTime, formatPrice, formatDate } from '@bus/utils'
import { Printer, Share2, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface Trip {
  id: string
  price: number
  departureTime: string
  arrivalTime: string
  availableSeats: number
  route: { fromCity: string; toCity: string }
  bus: { plateNumber: string; busType: string; totalSeats: number }
}
interface Point { id: string; name: string; offsetMin: number }
interface SeatInfo { totalSeats: number; bookedSeats: string[]; pickupPoints: Point[]; dropoffPoints: Point[] }

const METHODS = ['CASH', 'TELEBIRR', 'CBE_BIRR', 'BANK_TRANSFER'] as const

const field: React.CSSProperties = {
  width: '100%', border: '1px solid #E5E5E5', borderRadius: '10px', padding: '13px 14px',
  fontSize: '16px', outline: 'none', background: 'white', boxSizing: 'border-box',
}
const label: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '6px',
  textTransform: 'uppercase', letterSpacing: '0.5px',
}
const card: React.CSSProperties = {
  background: 'white', border: '1px solid #EEEEEE', borderRadius: '16px', padding: '18px', marginBottom: '16px',
}

export default function CounterPage() {
  return (
    <StaffShell allowed={['SELLER', 'MANAGER']} title="Counter sales">
      <CounterSales />
    </StaffShell>
  )
}

function CounterSales() {
  const [tab, setTab] = useState<'sell' | 'sales'>('sell')
  const [date, setDate] = useState(addisDay())
  const [trips, setTrips] = useState<Trip[]>([])
  const [loadingTrips, setLoadingTrips] = useState(true)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [seatInfo, setSeatInfo] = useState<SeatInfo | null>(null)
  const [seats, setSeats] = useState<string[]>([])
  const [pickupId, setPickupId] = useState('')
  const [dropoffId, setDropoffId] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [method, setMethod] = useState<(typeof METHODS)[number]>('CASH')
  const [reference, setReference] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sold, setSold] = useState<CounterSale | null>(null)
  const [sales, setSales] = useState<CounterSale[]>([])

  const loadTrips = useCallback(async () => {
    setLoadingTrips(true)
    try {
      const res = await api.get('/counter/trips', { params: { date } })
      setTrips(res.data.data.trips)
    } catch (err) {
      toast.error(errorOf(err, 'Failed to load trips'))
    } finally {
      setLoadingTrips(false)
    }
  }, [date])

  const loadSeats = useCallback(async (id: string) => {
    try {
      const res = await api.get(`/schedules/${id}/seats`)
      setSeatInfo(res.data.data)
    } catch {
      toast.error('Failed to load seats')
    }
  }, [])

  const loadSales = useCallback(async () => {
    try {
      const res = await api.get('/counter/sales', { params: { date: addisDay() } })
      setSales(res.data.data.sales)
    } catch (err) {
      toast.error(errorOf(err, 'Failed to load sales'))
    }
  }, [])

  useEffect(() => { loadTrips() }, [loadTrips])
  useEffect(() => { if (tab === 'sales') loadSales() }, [tab, loadSales])

  const chooseTrip = (t: Trip) => {
    setTrip(t); setSeatInfo(null); setSeats([]); setPickupId(''); setDropoffId('')
    loadSeats(t.id)
  }

  const needsPickup = (seatInfo?.pickupPoints.length ?? 0) > 0
  const needsReference = method !== 'CASH'
  const total = trip ? trip.price * seats.length : 0
  const ready = useMemo(
    () => !!trip && seats.length > 0 && name.trim().length >= 2 && phone.trim().length > 0
      && (!needsPickup || !!pickupId) && (!needsReference || reference.trim().length >= 4),
    [trip, seats, name, phone, needsPickup, pickupId, needsReference, reference]
  )

  const toggleSeat = (seat: string) =>
    setSeats((cur) => (cur.includes(seat) ? cur.filter((s) => s !== seat) : cur.length >= 10 ? cur : [...cur, seat]))

  const submit = async () => {
    if (!trip || !ready || submitting) return
    setSubmitting(true)
    try {
      const res = await api.post('/counter/sales', {
        scheduleId: trip.id, seatNumbers: seats,
        pickupPointId: pickupId || undefined, dropoffPointId: dropoffId || undefined,
        passengerName: name.trim(), passengerPhone: phone.trim(),
        method, reference: needsReference ? reference.trim() : undefined,
      })
      setSold(res.data.data.booking)
      toast.success('Ticket sold')
    } catch (err) {
      toast.error(errorOf(err, 'Sale failed'))
      // The seat may just have been taken: show the latest seat map
      if (trip) { loadSeats(trip.id); setSeats([]) }
    } finally {
      setSubmitting(false)
    }
  }

  const sellAnother = () => {
    setSold(null); setTrip(null); setSeatInfo(null); setSeats([]); setPickupId(''); setDropoffId('')
    setName(''); setPhone(''); setReference(''); setMethod('CASH')
    loadTrips()
  }

  const voidSale = async (sale: CounterSale) => {
    const reason = window.prompt(`Void ${sale.passengerName}'s ticket? This frees the seats. Give a reason:`)
    if (!reason) return
    try {
      await api.post(`/counter/sales/${sale.id}/void`, { reason })
      toast.success('Sale voided')
      loadSales()
    } catch (err) {
      toast.error(errorOf(err, 'Could not void this sale'))
    }
  }

  const share = async (code: string) => {
    const url = `${window.location.origin}/ticket/${code}`
    try {
      if (navigator.share) await navigator.share({ title: 'Bus ticket', text: 'Your bus ticket', url })
      else { await navigator.clipboard.writeText(url); toast.success('Ticket link copied') }
    } catch { /* the person closed the share sheet */ }
  }

  // ─── Ticket shown after a sale ────────────────────────
  if (sold) {
    return (
      <div>
        <div style={{ ...card, textAlign: 'center' }}>
          <CheckCircle2 size={36} color="#2E8B57" style={{ margin: '0 auto 8px' }} />
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>Ticket sold</div>
          <div style={{ fontSize: '13px', color: '#666', margin: '4px 0 14px' }}>
            {METHOD_LABEL[sold.payment?.method ?? ''] ?? ''} · {formatPrice(sold.totalPrice)}
          </div>
          {sold.qrCode && <img src={sold.qrCode} alt="Ticket QR code" width={180} height={180} style={{ margin: '0 auto' }} />}
          <div style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '4px', color: '#1a1a1a', marginTop: '6px' }}>{sold.ticketCode}</div>
          <div style={{ fontSize: '15px', fontWeight: 600, marginTop: '14px' }}>{sold.passengerName}</div>
          <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
            {sold.schedule.route.fromCity} → {sold.schedule.route.toCity}<br />
            {formatDate(sold.schedule.departureTime)} · {formatTime(sold.schedule.departureTime)}<br />
            Seat{sold.seatNumbers.length > 1 ? 's' : ''} {sold.seatNumbers.join(', ')}
            {sold.pickupPoint ? <><br />Pickup: {sold.pickupPoint.name}</> : null}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <button onClick={() => window.open(`/ticket/${sold.ticketCode}?print=1`, '_blank')}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'white', border: '1px solid #E5E5E5', borderRadius: '12px', padding: '14px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            <Printer size={16} /> Print
          </button>
          <button onClick={() => share(sold.ticketCode!)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'white', border: '1px solid #E5E5E5', borderRadius: '12px', padding: '14px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            <Share2 size={16} /> Share
          </button>
        </div>
        <button onClick={sellAnother}
          style={{ width: '100%', background: '#C0392B', color: 'white', border: 'none', borderRadius: '12px', padding: '16px', fontSize: '16px', fontWeight: 700, cursor: 'pointer' }}>
          Sell another ticket
        </button>
      </div>
    )
  }

  const tabBtn = (id: 'sell' | 'sales', text: string) => (
    <button onClick={() => setTab(id)}
      style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', background: tab === id ? '#1A0A0A' : 'transparent', color: tab === id ? 'white' : '#666' }}>
      {text}
    </button>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', background: '#EFEFEF', borderRadius: '12px', padding: '4px', marginBottom: '16px' }}>
        {tabBtn('sell', 'Sell a ticket')}
        {tabBtn('sales', "Today's sales")}
      </div>

      {tab === 'sales' && (
        <>
          <p style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>
            You can void your own sale within 15 minutes. Ask your manager after that.
          </p>
          <CounterSalesList sales={sales} onVoid={voidSale} />
        </>
      )}

      {tab === 'sell' && (
        <>
          {/* 1. Trip */}
          <div style={card}>
            <label style={label}>1. Day and trip</label>
            <input type="date" value={date} min={addisDay()} onChange={(e) => { setDate(e.target.value || addisDay()); setTrip(null); setSeats([]) }} style={{ ...field, marginBottom: '12px' }} />
            {loadingTrips && <p style={{ color: '#999', fontSize: '13px' }}>Loading trips...</p>}
            {!loadingTrips && trips.length === 0 && <p style={{ color: '#999', fontSize: '13px' }}>No open trips on this day.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {trips.map((t) => {
                const on = trip?.id === t.id
                return (
                  <button key={t.id} onClick={() => chooseTrip(t)} disabled={t.availableSeats === 0}
                    style={{ textAlign: 'left', padding: '12px 14px', borderRadius: '12px', cursor: t.availableSeats === 0 ? 'not-allowed' : 'pointer', border: on ? '2px solid #C0392B' : '1px solid #E5E5E5', background: on ? '#FFF5F5' : 'white', opacity: t.availableSeats === 0 ? 0.5 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '18px', fontWeight: 700 }}>{formatTime(t.departureTime)}</span>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#C0392B' }}>{formatPrice(t.price)}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {t.route.fromCity} → {t.route.toCity} · {t.bus.plateNumber} · {t.availableSeats === 0 ? 'Sold out' : `${t.availableSeats} seats left`}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2. Seats */}
          {trip && (
            <div style={card}>
              <label style={label}>2. Seats {seats.length > 0 && `(${seats.join(', ')})`}</label>
              {!seatInfo && <p style={{ color: '#999', fontSize: '13px' }}>Loading seats...</p>}
              {seatInfo && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', maxWidth: '320px', margin: '0 auto' }}>
                  {Array.from({ length: seatInfo.totalSeats }, (_, i) => String(i + 1).padStart(2, '0')).flatMap((seat, i) => {
                    const taken = seatInfo.bookedSeats.includes(seat)
                    const on = seats.includes(seat)
                    const btn = (
                      <button key={seat} disabled={taken} onClick={() => toggleSeat(seat)}
                        style={{ height: '46px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, border: on ? 'none' : '1px solid #E0E0E0', cursor: taken ? 'not-allowed' : 'pointer', background: on ? '#C0392B' : taken ? '#CCC' : '#F5F5F5', color: on ? 'white' : taken ? '#888' : '#333' }}>
                        {seat}
                      </button>
                    )
                    // an aisle after every second seat
                    return i % 4 === 1 ? [btn, <div key={`aisle-${i}`} />] : [btn]
                  })}
                </div>
              )}
            </div>
          )}

          {/* 3. Pickup and drop-off */}
          {trip && seatInfo && (needsPickup || seatInfo.dropoffPoints.length > 0) && (
            <div style={card}>
              {needsPickup && (
                <>
                  <label style={label}>3. Pickup point *</label>
                  <select value={pickupId} onChange={(e) => setPickupId(e.target.value)} style={{ ...field, marginBottom: seatInfo.dropoffPoints.length ? '12px' : 0 }}>
                    <option value="">Choose where the passenger boards</option>
                    {seatInfo.pickupPoints.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </>
              )}
              {seatInfo.dropoffPoints.length > 0 && (
                <>
                  <label style={label}>Drop-off (optional)</label>
                  <select value={dropoffId} onChange={(e) => setDropoffId(e.target.value)} style={field}>
                    <option value="">Not chosen</option>
                    {seatInfo.dropoffPoints.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </>
              )}
            </div>
          )}

          {/* 4. Passenger and payment */}
          {trip && (
            <div style={card}>
              <label style={label}>Passenger</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoComplete="off" style={{ ...field, marginBottom: '10px' }} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone, like 0911223344" inputMode="tel" autoComplete="off" style={{ ...field, marginBottom: '16px' }} />

              <label style={label}>Payment</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: needsReference ? '12px' : 0 }}>
                {METHODS.map((m) => (
                  <button key={m} onClick={() => setMethod(m)}
                    style={{ padding: '13px', borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', border: method === m ? '2px solid #C0392B' : '1px solid #E5E5E5', background: method === m ? '#FFF5F5' : 'white', color: method === m ? '#C0392B' : '#444' }}>
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
              {needsReference && (
                <>
                  <input value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} placeholder="Transaction number from the receipt SMS" autoComplete="off" style={field} />
                  <p style={{ fontSize: '11px', color: '#999', marginTop: '6px' }}>
                    Type it exactly as in the payment SMS. The same number can't be used for two tickets.
                  </p>
                </>
              )}
            </div>
          )}

          {trip && (
            <button onClick={submit} disabled={!ready || submitting}
              style={{ width: '100%', background: ready ? '#C0392B' : '#E0E0E0', color: ready ? 'white' : '#999', border: 'none', borderRadius: '12px', padding: '17px', fontSize: '16px', fontWeight: 700, cursor: ready && !submitting ? 'pointer' : 'not-allowed' }}>
              {submitting ? 'Selling...' : seats.length > 0 ? `Confirm sale · ${formatPrice(total)}` : 'Choose at least one seat'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
