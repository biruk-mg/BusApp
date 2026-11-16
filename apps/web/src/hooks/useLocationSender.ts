'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { errorOf } from '@/lib/counter'
import { isRejectedByServer } from '@/lib/checkin'
import { Fix, SEND_EVERY_MS, fixFrom, isNewFix, positionBody } from '@/lib/tripTracking'

export type Permission = 'unknown' | 'granted' | 'denied' | 'unsupported'
export type WakeLockState = 'on' | 'off' | 'unsupported'

/**
 * Asks the phone for permission to use its location, at the moment the checker taps Start.
 * The answer is not needed: the sender below shows the state. Never throws.
 */
export function askForLocation(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve()
    navigator.geolocation.getCurrentPosition(() => resolve(), () => resolve(), { timeout: 10000, maximumAge: 60000 })
  })
}

/** A clock that ticks, so "last sent 12 s ago" keeps counting. */
export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return now
}

/**
 * While `active` (the trip is live), keeps the newest GPS reading and sends it about every 20
 * seconds. A send that fails (weak signal) is not queued: the next tick sends whatever is newest,
 * because the server only keeps the newest position. Also asks the phone to keep the screen on.
 *
 * `onRefused` is called when the server says this trip is not live (ended, or not started), so
 * the page can load the trip again and show the truth.
 */
export function useLocationSender(tripId: string, active: boolean, onRefused: () => void) {
  const [permission, setPermission] = useState<Permission>('unknown')
  const [lastSent, setLastSent] = useState<{ at: number; accuracy: number | null } | null>(null)
  const [since, setSince] = useState(() => Date.now())
  const [problem, setProblem] = useState<string | null>(null)
  const [wakeLock, setWakeLock] = useState<WakeLockState>('off')

  const onRefusedRef = useRef(onRefused)
  onRefusedRef.current = onRefused

  useEffect(() => {
    if (!active) return
    let cancelled = false
    let inFlight = false
    let newest: Fix | null = null
    let lastSentTimestamp = 0

    setSince(Date.now())
    setLastSent(null)
    setProblem(null)
    setPermission('unknown')

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPermission('unsupported')
      return
    }

    const send = async () => {
      if (cancelled || inFlight || !isNewFix(newest, lastSentTimestamp)) return
      const fix = newest
      inFlight = true
      try {
        await api.post(`/checkin/trips/${tripId}/location`, positionBody(fix))
        if (cancelled) return
        lastSentTimestamp = fix.timestamp
        setLastSent({ at: Date.now(), accuracy: fix.accuracy })
        setProblem(null)
      } catch (err) {
        if (cancelled) return
        if (isRejectedByServer(err)) {
          const status = (err as { response?: { status?: number } }).response?.status
          // 404 or 409: the trip is not live any more (or never was). Let the page find out.
          if (status === 404 || status === 409) onRefusedRef.current()
          else setProblem(errorOf(err, 'The server did not accept the location'))
        }
        // No signal or a server error: keep the newest reading and try again at the next tick
      } finally {
        inFlight = false
      }
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        newest = fixFrom(pos)
        setPermission('granted')
        // The first reading goes out at once, not after 20 seconds
        if (lastSentTimestamp === 0) void send()
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setPermission('denied')
        // Position unavailable or timed out: the phone keeps looking, the page says "waiting"
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    )
    const timer = setInterval(() => void send(), SEND_EVERY_MS)

    return () => {
      cancelled = true
      navigator.geolocation.clearWatch(watchId)
      clearInterval(timer)
    }
  }, [tripId, active])

  // Keep the screen on. The phone gives the lock back when the page is hidden, so ask again
  // when the checker comes back to it.
  useEffect(() => {
    if (!active) return
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      setWakeLock('unsupported')
      return
    }
    let cancelled = false
    let lock: WakeLockSentinel | null = null

    const take = async () => {
      if (lock && !lock.released) return
      try {
        const got = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void got.release()
          return
        }
        lock = got
        setWakeLock('on')
        got.addEventListener('release', () => { if (!cancelled) setWakeLock('off') })
      } catch {
        if (!cancelled) setWakeLock('off')
      }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void take() }

    void take()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [active])

  return { permission, lastSent, since, problem, wakeLock }
}
