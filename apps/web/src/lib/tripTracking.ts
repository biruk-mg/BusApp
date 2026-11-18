// Live tracking, phone side. Plain functions only (no React, no browser objects), so a test
// runner can cover them later. The server rules live in apps/api/src/lib/tracking.ts.

export type TripPhase = 'NOT_STARTED' | 'LIVE' | 'ENDED'

export function tripPhase(trip: { startedAt?: string | null; endedAt?: string | null }): TripPhase {
  if (trip.endedAt) return 'ENDED'
  if (trip.startedAt) return 'LIVE'
  return 'NOT_STARTED'
}

// The phone sends its newest position this often. The server allows 30 a minute.
export const SEND_EVERY_MS = 20_000
// After this long without a successful send, the checker is warned.
export const STALE_AFTER_MS = 2 * 60 * 1000

/** One GPS reading, as the phone gave it. */
export interface Fix {
  lat: number
  lng: number
  accuracy: number | null
  speed: number | null
  heading: number | null
  timestamp: number // milliseconds since 1970, from the phone
}

interface PositionLike {
  coords: {
    latitude: number
    longitude: number
    accuracy: number | null
    speed: number | null
    heading: number | null
  }
  timestamp: number
}

const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function fixFrom(pos: PositionLike): Fix {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: num(pos.coords.accuracy),
    speed: num(pos.coords.speed),
    heading: num(pos.coords.heading),
    timestamp: pos.timestamp,
  }
}

/**
 * The body for POST /checkin/trips/:id/location. The server refuses a speed or heading outside
 * its range, so a reading with a strange value is sent without that value instead of failing.
 */
export function positionBody(fix: Fix) {
  const body: { lat: number; lng: number; recordedAt: string; accuracy?: number; speed?: number; heading?: number } = {
    lat: fix.lat,
    lng: fix.lng,
    recordedAt: new Date(fix.timestamp).toISOString(),
  }
  if (fix.accuracy !== null && fix.accuracy >= 0 && fix.accuracy <= 100000) body.accuracy = Math.round(fix.accuracy)
  if (fix.speed !== null && fix.speed >= 0 && fix.speed <= 100) body.speed = Math.round(fix.speed * 10) / 10
  if (fix.heading !== null && fix.heading >= 0 && fix.heading <= 360) body.heading = Math.round(fix.heading)
  return body
}

/** Only a reading newer than the last one that was sent is worth sending (the server keeps one). */
export function isNewFix(fix: Fix | null, lastSentTimestamp: number): fix is Fix {
  return !!fix && fix.timestamp > lastSentTimestamp
}

export const secondsAgo = (from: number, now: number) => Math.max(0, Math.floor((now - from) / 1000))

/** "12 s", "3 min", "2 h" */
export function agoText(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`
  return `${Math.floor(seconds / 3600)} h`
}

/** "about 15 m", "about 1.2 km", or "" when the phone did not say. */
export function accuracyText(metres: number | null): string {
  if (metres === null) return ''
  if (metres >= 1000) return `about ${(metres / 1000).toFixed(1)} km`
  return `about ${Math.max(1, Math.round(metres))} m`
}

export type SendingState = 'BLOCKED' | 'UNSUPPORTED' | 'SENDING' | 'WAITING' | 'STALE'

/**
 * What to tell the checker. `since` is when this phone started sending (page opened or trip
 * started), so a page reloaded in the middle of a trip gets two minutes to find a position
 * before it is called stale.
 */
export function sendingState(input: {
  permission: 'unknown' | 'granted' | 'denied' | 'unsupported'
  lastSentAt: number | null
  since: number
  now: number
}): SendingState {
  if (input.permission === 'denied') return 'BLOCKED'
  if (input.permission === 'unsupported') return 'UNSUPPORTED'
  const reference = input.lastSentAt ?? input.since
  const stale = input.now - reference > STALE_AFTER_MS
  if (stale) return 'STALE'
  return input.lastSentAt === null ? 'WAITING' : 'SENDING'
}

// ---------------------------------------------------------------------------------------------
// Passenger side: what the passenger is told about the bus. GET /bookings/:id/tracking
// ---------------------------------------------------------------------------------------------

export interface PassengerTracking {
  state: TripPhase
  startedAt: string | null
  endedAt: string | null
  position: null | {
    lat: number
    lng: number
    accuracy: number | null
    speed: number | null // metres per second
    heading: number | null
    recordedAt: string
    ageSeconds: number // worked out by the server when it answered
  }
  // The passenger's own pickup point (when it has a map position) and the estimated minutes to it
  pickup: null | { name: string; lat: number; lng: number }
  eta: null | { minutes: number; distanceKm: number; basis: 'SPEED' | 'AVERAGE'; arriving: boolean }
}

export type PassengerTone = 'wait' | 'live' | 'old' | 'ended'

export interface PassengerView {
  tone: PassengerTone
  headline: string
  detail: string | null
  mapsUrl: string | null
  /** "About 25 min to Bole Ambassador", or null when there is no estimate */
  etaLine: string | null
  /** How the estimate was made, in a few words */
  etaNote: string | null
}

/**
 * Minutes in words. An estimate must not look exact: under 10 minutes it is as the server said,
 * from 10 minutes it is rounded to the nearest 5, from an hour it is hours and minutes.
 */
export function etaMinutesText(minutes: number): string {
  const m = Math.max(1, Math.round(minutes))
  const shown = m < 10 ? m : Math.round(m / 5) * 5
  if (shown < 60) return `${shown} min`
  const h = Math.floor(shown / 60)
  const rest = shown % 60
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`
}

function etaWords(t: PassengerTracking): Pick<PassengerView, 'etaLine' | 'etaNote'> {
  if (!t.eta || !t.pickup) return { etaLine: null, etaNote: null }
  if (t.eta.arriving) return { etaLine: `The bus is close to ${t.pickup.name}`, etaNote: null }
  return {
    etaLine: `About ${etaMinutesText(t.eta.minutes)} to ${t.pickup.name}`,
    etaNote:
      t.eta.basis === 'SPEED'
        ? `${t.eta.distanceKm} km away in a straight line, at the bus's current speed. An estimate: traffic and the road can change it.`
        : `${t.eta.distanceKm} km away in a straight line, at a usual bus speed because the bus is slow or stopped. An estimate: traffic and the road can change it.`,
  }
}

/**
 * The words for the passenger. `secondsSinceAnswer` is how long ago the page got the answer, so
 * "last seen" keeps counting between refreshes. A position older than two minutes is shown as
 * the LAST KNOWN place, never as a live dot.
 */
export function passengerView(t: PassengerTracking, secondsSinceAnswer = 0): PassengerView {
  if (t.state === 'NOT_STARTED') {
    return { tone: 'wait', headline: 'The bus has not left yet', detail: 'When the trip starts, you will see where the bus is here.', mapsUrl: null, etaLine: null, etaNote: null }
  }
  if (t.state === 'ENDED') {
    return { tone: 'ended', headline: 'This trip has ended', detail: null, mapsUrl: null, etaLine: null, etaNote: null }
  }
  const p = t.position
  if (!p) {
    return { tone: 'wait', headline: 'The trip has started', detail: 'Waiting for the bus to share its location.', mapsUrl: null, etaLine: null, etaNote: null }
  }
  const age = p.ageSeconds + Math.max(0, secondsSinceAnswer)
  const mapsUrl = `https://www.google.com/maps?q=${p.lat},${p.lng}`
  if (age > STALE_AFTER_MS / 1000) {
    return {
      tone: 'old',
      headline: 'Last known location of the bus',
      detail: `Last seen ${agoText(age)} ago. The bus may be where there is no signal.`,
      mapsUrl,
      // An old position gives no honest estimate
      etaLine: null,
      etaNote: null,
    }
  }
  const parts = [`Last seen ${agoText(age)} ago`]
  const kmh = p.speed === null ? 0 : Math.round(p.speed * 3.6)
  if (kmh >= 5) parts.push(`moving about ${kmh} km/h`)
  const acc = accuracyText(p.accuracy)
  if (acc) parts.push(`GPS accuracy ${acc}`)
  return { tone: 'live', headline: 'Your bus location is live', detail: parts.join(' · '), mapsUrl, ...etaWords(t) }
}
