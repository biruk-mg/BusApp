'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import StaffShell from '@/components/StaffShell'
import QrScanner from '@/components/QrScanner'
import { api } from '@/lib/api'
import { errorOf, addisDay } from '@/lib/counter'
import {
  CheckinTrip, Passenger, TripDetail, Lookup, TICKET_CODE_RE, asTicketCode, codeFromScan,
  seatsOf, boardedSeatsOf, isRejectedByServer,
} from '@/lib/checkin'
import { useAuthStore } from '@/store/auth.store'
import { formatTime, formatDate } from '@bus/utils'
import { ArrowLeft, ChevronLeft, ChevronRight, Check, Phone, Search, RefreshCw, TriangleAlert, ScanLine } from 'lucide-react'
import toast from 'react-hot-toast'

const card: React.CSSProperties = {
  background: 'white', border: '1px solid #EEEEEE', borderRadius: '16px', padding: '16px', marginBottom: '12px',
}

export default function CheckerPage() {
  // The master admin is not included: every tick must belong to a staff member of a company.
  return (
    <StaffShell allowed={['CHECKER', 'MANAGER']} title="Boarding list">
      <Boarding />
    </StaffShell>
  )
}

/** Moves a YYYY-MM-DD date by whole days (no time zones involved). */
function shiftDay(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function Boarding() {
  const { user } = useAuthStore()
  const [date, setDate] = useState(addisDay())
  const [trips, setTrips] = useState<CheckinTrip[]>([])
  const [loadingTrips, setLoadingTrips] = useState(true)
  const [tripId, setTripId] = useState<string | null>(null)

  const loadTrips = useCallback(async () => {
    setLoadingTrips(true)
    try {
      const res = await api.get('/checkin/trips', { params: { date } })
      setTrips(res.data.data.trips)
    } catch (err) {
      toast.error(errorOf(err, 'Could not load the trips. Check your signal and try again.'))
    } finally {
      setLoadingTrips(false)
    }
  }, [date])

  useEffect(() => { if (!tripId) loadTrips() }, [loadTrips, tripId])

  // A manager came here from the operator portal and needs a way back
  const isManager = user?.staff?.role === 'MANAGER'

  if (tripId) {
    return (
      <PassengerList
        tripId={tripId}
        onBack={() => setTripId(null)}
        onOpenOtherTrip={(id, when) => { setDate(addisDay(when)); setTripId(id) }}
      />
    )
  }

  return (
    <div>
      {isManager && (
        <Link href="/operator" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#C0392B', textDecoration: 'none', marginBottom: '14px' }}>
          <ArrowLeft size={14} /> Back to the operator portal
        </Link>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <button aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))} style={navBtn}><ChevronLeft size={18} /></button>
        <input
          type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
          style={{ flex: 1, minWidth: 0, border: '1px solid #E5E5E5', borderRadius: '10px', padding: '12px', fontSize: '16px', background: 'white', boxSizing: 'border-box' }}
        />
        <button aria-label="Next day" onClick={() => setDate(shiftDay(date, 1))} style={navBtn}><ChevronRight size={18} /></button>
      </div>
      {date !== addisDay() && (
        <button onClick={() => setDate(addisDay())} style={{ background: 'none', border: 'none', color: '#C0392B', fontSize: '13px', cursor: 'pointer', marginBottom: '12px', padding: 0 }}>
          Go to today
        </button>
      )}

      {loadingTrips && <p style={{ color: '#999', fontSize: '14px' }}>Loading trips...</p>}
      {!loadingTrips && trips.length === 0 && (
        <div style={{ ...card, textAlign: 'center', color: '#999', fontSize: '14px' }}>
          No trips on {formatDate(`${date}T12:00:00+03:00`)}.
        </div>
      )}

      {trips.map((t) => (
        <button key={t.id} onClick={() => setTripId(t.id)} style={{ ...card, display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>{formatTime(t.departureTime)}</div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: t.boardedSeats === t.soldSeats && t.soldSeats > 0 ? '#2E8B57' : '#1a1a1a' }}>
                {t.boardedSeats} / {t.soldSeats}
              </div>
              <div style={{ fontSize: '11px', color: '#999' }}>seats boarded</div>
            </div>
          </div>
          <div style={{ fontSize: '14px', color: '#444', marginTop: '6px' }}>{t.route.fromCity} → {t.route.toCity}</div>
          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
            {t.bus.plateNumber} · {t.bus.busType}
            {t.status === 'CLOSED' && <span style={{ marginLeft: '8px', color: '#C0392B', fontWeight: 600 }}>Closed to new bookings</span>}
          </div>
        </button>
      ))}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: '44px', height: '44px', borderRadius: '10px', border: '1px solid #E5E5E5', background: 'white',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
}

function PassengerList({ tripId, onBack, onOpenOtherTrip }: {
  tripId: string
  onBack: () => void
  onOpenOtherTrip: (tripId: string, departureTime: string) => void
}) {
  const [trip, setTrip] = useState<TripDetail | null>(null)
  const [passengers, setPassengers] = useState<Passenger[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  // Ticks the server has not confirmed yet (bad signal): passenger id -> what we want it to be.
  // They stay on screen as ticked, in orange, until they are saved.
  const [unsaved, setUnsaved] = useState<Record<string, boolean>>({})
  const unsavedRef = useRef(unsaved)
  unsavedRef.current = unsaved

  /** Loads the list. Ticks not saved yet keep the state the checker chose. */
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const res = await api.get(`/checkin/trips/${tripId}/passengers`)
      const fresh: Passenger[] = res.data.data.passengers
      setTrip(res.data.data.trip)
      setPassengers(fresh.map((p) => (p.id in unsavedRef.current ? { ...p, boarded: unsavedRef.current[p.id] } : p)))
    } catch (err) {
      if (!quiet) toast.error(errorOf(err, 'Could not load the passengers. Check your signal and try again.'))
    } finally {
      setLoading(false)
    }
  }, [tripId])

  useEffect(() => { load() }, [load])
  // New tickets are sold at the counter all the time, so look again every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(true) }, 30000)
    return () => clearInterval(timer)
  }, [load])

  const change = (id: string, patch: Partial<Passenger>) =>
    setPassengers((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  /** Tick or untick. The screen changes at once; the server is told in the background. */
  const setBoarded = useCallback(async (id: string, want: boolean) => {
    change(id, { boarded: want })
    setBusy((s) => new Set(s).add(id))
    try {
      const res = await api.post(`/checkin/bookings/${id}/${want ? 'board' : 'unboard'}`)
      change(id, res.data.data.passenger)
      if (res.data.data.alreadyBoarded) {
        // Someone ticked this passenger a moment ago: a second checker, or a ticket shown twice
        const p: Passenger = res.data.data.passenger
        toast(`${p.name} was already ticked as boarded${p.boardedBy ? ` by ${p.boardedBy}` : ''}${p.boardedAt ? ` at ${formatTime(p.boardedAt)}` : ''}.`, { icon: '⚠️', duration: 7000 })
      }
      setUnsaved((u) => { const { [id]: _gone, ...rest } = u; return rest })
    } catch (err) {
      if (isRejectedByServer(err)) {
        // The server said no (for example the ticket was voided a moment ago): show the truth
        setUnsaved((u) => { const { [id]: _gone, ...rest } = u; return rest })
        toast.error(errorOf(err, 'Could not save this tick'))
        load(true)
      } else {
        setUnsaved((u) => ({ ...u, [id]: want }))
      }
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(id); return n })
    }
  }, [load])

  const retryAll = () => Object.entries(unsavedRef.current).forEach(([id, want]) => setBoarded(id, want))
  const unsavedCount = Object.keys(unsaved).length

  // Typing a whole ticket code that is not on this trip's list: ask the server about it
  const code = asTicketCode(query)
  const onList = passengers.some((p) => p.ticketCode === code)
  useEffect(() => {
    setLookup(null)
    if (!TICKET_CODE_RE.test(code) || onList) return
    let cancelled = false
    setLookingUp(true)
    api.get(`/checkin/lookup/${code}`)
      .then((res) => { if (!cancelled) setLookup(res.data.data) })
      .catch((err) => { if (!cancelled) toast.error(errorOf(err, 'No ticket with that code at your company')) })
      .finally(() => { if (!cancelled) setLookingUp(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, onList])

  const onScan = (text: string) => {
    setScanning(false)
    const scanned = codeFromScan(text)
    if (!scanned) {
      toast.error('That QR code is not an MugoBus ticket')
      return
    }
    navigator.vibrate?.(60)
    setQuery(scanned)
  }

  // A whole ticket code that is on this trip's list: say clearly whether it is good to board
  const matched = TICKET_CODE_RE.test(code) ? passengers.find((p) => p.ticketCode === code) ?? null : null

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return passengers
    return passengers.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.phone ?? '').includes(q) ||
      p.seatNumbers.some((s) => s === q || s === q.padStart(2, '0')) ||
      (p.ticketCode ?? '').toLowerCase() === asTicketCode(q).toLowerCase()
    )
  }, [passengers, query])

  // Group by pickup point, in the order the list came from the server
  const groups = useMemo(() => {
    const out: { key: string; title: string; offsetMin: number | null; people: Passenger[] }[] = []
    for (const p of shown) {
      const key = p.pickupPoint?.id ?? 'none'
      let g = out.find((x) => x.key === key)
      if (!g) {
        g = { key, title: p.pickupPoint?.name ?? 'No pickup point', offsetMin: p.pickupPoint?.offsetMin ?? null, people: [] }
        out.push(g)
      }
      g.people.push(p)
    }
    return out
  }, [shown])

  const sold = seatsOf(passengers)
  const boarded = boardedSeatsOf(passengers)

  return (
    <div>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#C0392B', fontSize: '14px', cursor: 'pointer', padding: 0, marginBottom: '12px' }}>
        <ArrowLeft size={16} /> All trips
      </button>

      {trip && (
        <div style={{ ...card, background: '#1A0A0A', border: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'white' }}>{formatTime(trip.departureTime)}</div>
              <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>{trip.route.fromCity} → {trip.route.toCity}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>{trip.bus.plateNumber}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '26px', fontWeight: 700, color: boarded === sold && sold > 0 ? '#5ED68A' : '#D4A017' }}>{boarded} / {sold}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>seats boarded</div>
            </div>
          </div>
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.15)', borderRadius: '3px', marginTop: '12px' }}>
            <div style={{ height: '100%', width: `${sold ? (boarded / sold) * 100 : 0}%`, background: '#5ED68A', borderRadius: '3px', transition: 'width .2s' }} />
          </div>
        </div>
      )}

      {unsavedCount > 0 && (
        <div style={{ ...card, background: '#FFF8E6', border: '1px solid #F0D58C', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <TriangleAlert size={18} color="#B7791F" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: '13px', color: '#7A5A12' }}>
            {unsavedCount} tick{unsavedCount > 1 ? 's are' : ' is'} not saved yet (weak signal). Keep this page open.
          </div>
          <button onClick={retryAll} style={{ background: '#B7791F', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} color="#999" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, phone, seat or code"
            autoComplete="off" autoCapitalize="none"
            style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: '10px', padding: '13px 14px 13px 36px', fontSize: '16px', boxSizing: 'border-box', background: 'white' }}
          />
        </div>
        <button aria-label="Scan a ticket's QR code" onClick={() => setScanning(true)}
          style={{ ...navBtn, width: 'auto', background: '#1A0A0A', color: 'white', border: 'none', gap: '6px', padding: '0 14px', fontSize: '13px', fontWeight: 600 }}>
          <ScanLine size={18} /> Scan
        </button>
        <button aria-label="Refresh the list" onClick={() => load()} style={navBtn}><RefreshCw size={16} /></button>
      </div>

      {scanning && <QrScanner onScan={onScan} onClose={() => setScanning(false)} />}

      {matched && (
        <MatchNotice p={matched} busy={busy.has(matched.id)} onBoard={() => setBoarded(matched.id, true)} />
      )}

      {lookingUp && <p style={{ color: '#999', fontSize: '13px' }}>Looking for that ticket...</p>}
      {lookup && (
        <LookupNotice lookup={lookup} onOpen={() => onOpenOtherTrip(lookup.trip.id, lookup.trip.departureTime)} />
      )}

      {loading && <p style={{ color: '#999', fontSize: '14px' }}>Loading passengers...</p>}
      {!loading && passengers.length === 0 && (
        <div style={{ ...card, textAlign: 'center', color: '#999', fontSize: '14px' }}>No paid tickets on this trip yet.</div>
      )}
      {!loading && passengers.length > 0 && shown.length === 0 && !lookup && !lookingUp && (
        <p style={{ color: '#999', fontSize: '14px' }}>Nobody matches “{query}”.</p>
      )}

      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 4px 8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {g.title}
              {g.offsetMin !== null && trip && (
                <span style={{ fontWeight: 400, color: '#999', textTransform: 'none', letterSpacing: 0 }}>
                  {' '}· ~{formatTime(new Date(new Date(trip.departureTime).getTime() + g.offsetMin * 60000).toISOString())}
                </span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#999' }}>{boardedSeatsOf(g.people)} / {seatsOf(g.people)}</div>
          </div>

          {g.people.map((p) => (
            <PassengerRow
              key={p.id} p={p} saving={busy.has(p.id)} unsaved={p.id in unsaved}
              onToggle={() => setBoarded(p.id, !p.boarded)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function PassengerRow({ p, saving, unsaved, onToggle }: {
  p: Passenger; saving: boolean; unsaved: boolean; onToggle: () => void
}) {
  const tickColor = unsaved ? '#D4A017' : '#2E8B57'
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', marginBottom: '8px', borderRadius: '14px', overflow: 'hidden',
      border: `1px solid ${p.boarded ? (unsaved ? '#F0D58C' : '#BFE5CC') : '#EEEEEE'}`,
      background: p.boarded ? (unsaved ? '#FFFBEF' : '#F2FBF6') : 'white',
    }}>
      <button
        onClick={onToggle} disabled={saving}
        aria-label={p.boarded ? `Undo boarding for ${p.name}` : `Mark ${p.name} as boarded`}
        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: 'none', border: 'none', textAlign: 'left', cursor: saving ? 'wait' : 'pointer' }}
      >
        <span style={{
          width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: p.boarded ? 'none' : '2px solid #CCC', background: p.boarded ? tickColor : 'white', opacity: saving ? 0.6 : 1,
        }}>
          {p.boarded && <Check size={18} color="white" strokeWidth={3} />}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '16px', fontWeight: 600, color: '#1a1a1a', textDecoration: p.boarded ? 'none' : undefined, overflowWrap: 'anywhere' }}>{p.name}</span>
          <span style={{ display: 'block', fontSize: '12px', color: '#777', marginTop: '3px' }}>
            Seat {p.seatNumbers.join(', ')}
            {p.dropoffPoint ? ` · gets off at ${p.dropoffPoint}` : ''}
            {p.source === 'ONLINE' ? ' · online' : ''}
            {unsaved ? ' · not saved yet' : p.boarded && p.boardedBy ? ` · ticked by ${p.boardedBy}` : ''}
          </span>
        </span>
      </button>
      {p.phone && (
        <a href={`tel:${p.phone}`} aria-label={`Call ${p.name}`}
          style={{ width: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid #F0F0F0', color: '#C0392B' }}>
          <Phone size={18} />
        </a>
      )}
    </div>
  )
}

/** Shown when a typed ticket code is not on this trip's list. */
function MatchNotice({ p, busy, onBoard }: { p: Passenger; busy: boolean; onBoard: () => void }) {
  const used = p.boarded
  return (
    <div style={{ ...card, background: used ? '#FFF4E5' : '#F0FFF4', border: `1px solid ${used ? '#F0D58C' : '#BFE5CC'}` }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: used ? '#B7791F' : '#2E8B57', marginBottom: '4px' }}>
        {used ? '⚠️ ALREADY BOARDED' : '✅ VALID TICKET'}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', overflowWrap: 'anywhere' }}>{p.name}</div>
      <div style={{ fontSize: '14px', color: '#555', marginTop: '2px' }}>
        Seat {p.seatNumbers.join(', ')}{p.pickupPoint ? ` · ${p.pickupPoint.name}` : ''}
      </div>
      {used ? (
        <div style={{ fontSize: '13px', color: '#B7791F', marginTop: '8px' }}>
          Ticked{p.boardedAt ? ` at ${formatTime(p.boardedAt)}` : ''}{p.boardedBy ? ` by ${p.boardedBy}` : ''}. If someone else is showing this ticket, do not let them on.
        </div>
      ) : (
        <button onClick={onBoard} disabled={busy}
          style={{ marginTop: '12px', width: '100%', background: '#2E8B57', color: 'white', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '16px', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          Board {p.name}
        </button>
      )}
    </div>
  )
}

function LookupNotice({ lookup, onOpen }: { lookup: Lookup; onOpen: () => void }) {
  const voided = lookup.state === 'VOIDED'
  return (
    <div style={{ ...card, background: voided ? '#FEF2F2' : '#FFF8E6', border: `1px solid ${voided ? '#F3B8B2' : '#F0D58C'}` }}>
      <div style={{ fontSize: '15px', fontWeight: 700, color: voided ? '#C0392B' : '#7A5A12', marginBottom: '6px' }}>
        {voided ? 'This ticket is cancelled. Do not let this person board.' : 'This ticket is for a different trip.'}
      </div>
      <div style={{ fontSize: '13px', color: '#555', lineHeight: 1.5 }}>
        {lookup.passenger.name} · seat {lookup.passenger.seatNumbers.join(', ')}<br />
        {lookup.trip.route.fromCity} → {lookup.trip.route.toCity}, {formatDate(lookup.trip.departureTime)} at {formatTime(lookup.trip.departureTime)}
        {lookup.state === 'ALREADY_BOARDED' && <><br /><strong>Already ticked as boarded.</strong></>}
      </div>
      {!voided && (
        <button onClick={onOpen} style={{ marginTop: '10px', background: '#C0392B', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          Open that trip
        </button>
      )}
    </div>
  )
}
