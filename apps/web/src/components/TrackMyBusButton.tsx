'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatTime } from '@bus/utils'
import { Bus, ChevronRight } from 'lucide-react'

interface NextTrip {
  bookingId: string
  live: boolean
  departureTime: string
  fromCity: string
  toCity: string
}

/**
 * "Track my bus" for the home page: shown only to a logged-in passenger who has a paid online
 * ticket for a trip that can be followed now. It opens the live map for that ticket.
 * It asks quietly: a failed or expired login shows nothing and never logs anyone out, because
 * the home page is public.
 */
export default function TrackMyBusButton() {
  const [next, setNext] = useState<NextTrip | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (cancelled || document.visibilityState === 'hidden' || !localStorage.getItem('token')) return
      try {
        // validateStatus: a 401 (old login) is read here as "nothing to show", not as an error
        const res = await api.get('/bookings/tracking/next', { validateStatus: () => true })
        if (cancelled) return
        setNext(res.status === 200 ? ((res.data?.data?.next as NextTrip | null) ?? null) : null)
      } catch {
        /* no signal: keep what is shown */
      }
    }
    void load()
    const timer = setInterval(() => void load(), 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  if (!next) return null

  return (
    <Link
      href={`/track/${next.bookingId}`}
      style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#1A0A0A', color: 'white', borderRadius: '16px', padding: '14px 18px', marginBottom: '20px', textDecoration: 'none', maxWidth: '420px' }}
    >
      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#C0392B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Bus size={20} color="white" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 700 }}>Track my bus</div>
        <div style={{ fontSize: '12px', color: '#E0CFCF', marginTop: '2px' }}>
          {next.fromCity} → {next.toCity} · {next.live ? 'On the way now' : `Leaves ${formatTime(next.departureTime)}`}
        </div>
      </div>
      <ChevronRight size={18} color="#E0CFCF" />
    </Link>
  )
}
