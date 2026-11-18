'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { PassengerTracking } from '@/lib/tripTracking'

/**
 * Asks the server where the bus is, for the owner of a paid ticket. Asks again every
 * `refreshMs` while the page is open and visible, and stops once the trip has ended.
 * `hidden` turns true when the server says this ticket cannot follow a bus.
 * `secondsSinceAnswer` keeps counting between refreshes, so "last seen" stays right.
 */
export function usePassengerTracking(bookingId: string, refreshMs: number) {
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
    const poll = setInterval(() => void load(), refreshMs)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(poll)
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [bookingId, refreshMs])

  const secondsSinceAnswer = answeredAt ? Math.floor((now - answeredAt) / 1000) : 0
  return { tracking, hidden, failed, secondsSinceAnswer }
}
