'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { Radio, MapPin } from 'lucide-react'
import { PassengerTone, PassengerTracking, passengerView } from '@/lib/tripTracking'

const REFRESH_MS = 20_000

const TONES: Record<PassengerTone, { bg: string; border: string; color: string }> = {
  live: { bg: '#F0FFF4', border: '#BBF7D0', color: '#166534' },
  old: { bg: '#FFFBEB', border: '#FDE68A', color: '#92400E' },
  wait: { bg: '#F7F7F7', border: '#E5E5E5', color: '#555' },
  ended: { bg: '#F7F7F7', border: '#E5E5E5', color: '#555' },
}

/**
 * "Where is my bus": for the owner of a paid online ticket. Asks the server every 20 seconds
 * while the page is open and visible, and stops once the trip has ended. Hides itself when the
 * server says this ticket cannot follow a bus.
 */
export default function BusTrackingCard({ bookingId }: { bookingId: string }) {
  const [tracking, setTracking] = useState<PassengerTracking | null>(null)
  const [answeredAt, setAnsweredAt] = useState(0)
  const [hidden, setHidden] = useState(false)
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const ended = useRef(false)

  useEffect(() => {
    let cancelled = false
    ended.current = false

    const load = async () => {
      if (cancelled || ended.current || document.visibilityState === 'hidden') return
      try {
        const res = await api.get(`/bookings/${bookingId}/tracking`)
        if (cancelled) return
        const t = res.data.data.tracking as PassengerTracking
        setTracking(t)
        setAnsweredAt(Date.now())
        setFailed(false)
        if (t.state === 'ENDED') ended.current = true
      } catch (err) {
        if (cancelled) return
        const status = (err as { response?: { status?: number } }).response?.status
        if (status === 404) setHidden(true)
        else setFailed(true) // no signal: keep what is on screen and try again
      }
    }

    void load()
    const poll = setInterval(() => void load(), REFRESH_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(poll)
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [bookingId])

  if (hidden) return null

  const view = tracking ? passengerView(tracking, Math.floor((now - answeredAt) / 1000)) : null
  const tone = TONES[view?.tone ?? 'wait']

  return (
    <div style={{ background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: '16px', padding: '16px 18px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Radio size={18} color={tone.color} style={{ flexShrink: 0 }} />
        <div style={{ fontSize: '15px', fontWeight: 700, color: tone.color }}>{view ? view.headline : 'Looking for your bus...'}</div>
      </div>
      {view?.detail && <div style={{ fontSize: '13px', color: tone.color, marginTop: '6px', lineHeight: 1.5 }}>{view.detail}</div>}
      {failed && <div style={{ fontSize: '12px', color: '#92400E', marginTop: '6px' }}>Could not refresh. Trying again...</div>}
      {view?.mapsUrl && (
        <a
          href={view.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '12px', background: '#C0392B', color: 'white', borderRadius: '10px', padding: '10px 16px', fontSize: '14px', fontWeight: 600, textDecoration: 'none' }}
        >
          <MapPin size={16} /> Open in Google Maps
        </a>
      )}
    </div>
  )
}
