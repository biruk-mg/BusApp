import { z } from 'zod'

/**
 * Live bus tracking: the rules in one place, so the routes and the tests agree.
 *
 * The ticket checker taps Start trip, the checker's phone then sends its position every
 * ~20 seconds, and passengers with a paid ticket for the trip can see it until the checker
 * taps End trip. Nothing is shown before Start or after End.
 */

export type TripPhase = 'NOT_STARTED' | 'LIVE' | 'ENDED'

export function tripPhase(trip: { startedAt: Date | null; endedAt: Date | null }): TripPhase {
  if (trip.endedAt) return 'ENDED'
  if (trip.startedAt) return 'LIVE'
  return 'NOT_STARTED'
}

const HOUR = 60 * 60 * 1000

// A trip can be started from 3 hours before it is due to leave (boarding time) until 12 hours
// after. A time window, not "the same calendar day", so a night bus that leaves after
// midnight still works.
export const START_EARLY_HOURS = 3
export const START_LATE_HOURS = 12

export function canStartNow(departureTime: Date, now: Date = new Date()): boolean {
  const t = departureTime.getTime()
  return now.getTime() >= t - START_EARLY_HOURS * HOUR && now.getTime() <= t + START_LATE_HOURS * HOUR
}

// A position older than this is not worth keeping (a phone that was offline for hours).
export const POSITION_MAX_AGE_HOURS = 6
// Phone clocks are sometimes a little fast. More than this in the future is refused.
export const POSITION_MAX_FUTURE_MIN = 5

export const positionBody = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000).optional(),
  speed: z.number().min(0).max(100).optional(), // metres per second (100 m/s = 360 km/h)
  heading: z.number().min(0).max(360).optional(),
  recordedAt: z.string().datetime({ offset: true }).optional(),
})
export type PositionBody = z.infer<typeof positionBody>

/** Returns a message if the time the phone gave is not acceptable, otherwise null. */
export function recordedAtProblem(recordedAt: Date, now: Date = new Date()): string | null {
  const age = now.getTime() - recordedAt.getTime()
  if (age > POSITION_MAX_AGE_HOURS * HOUR) return 'This position is too old'
  if (age < -POSITION_MAX_FUTURE_MIN * 60 * 1000) return "The phone's clock is ahead of the server's. Check the date and time on the phone"
  return null
}

// ---------------------------------------------------------------------------------------------
// Minutes until the bus reaches the passenger's pickup point.
//
// This is an ESTIMATE, and is worded as one. Only the newest position is kept (no history), so
// the speed is the bus's speed right now, and the distance is a straight line made longer to
// allow for the road. It does not know the road, the traffic or which side of the pickup the bus
// is on, so it can be wrong in both directions.
// ---------------------------------------------------------------------------------------------

export interface PickupPlace {
  name: string
  lat: number
  lng: number
}

// A passenger can follow the bus from 12 hours before departure until a day after it.
export const FOLLOW_BEFORE_HOURS = 12
export const FOLLOW_AFTER_HOURS = 24

// A position older than this is shown as "last known place" and gets no minutes.
export const FRESH_POSITION_SECONDS = 120
// Roads are longer than the straight line between two points.
export const ROAD_FACTOR = 1.3
// Below this speed the bus is stopped or crawling, and the speed says nothing about the rest of the way.
export const MOVING_KMH = 15
export const AVERAGE_BUS_KMH = 40
export const MAX_BUS_KMH = 90
// Closer than this, the bus is "arriving".
export const ARRIVING_METRES = 300
// Further than this, the numbers are not believable (a pickup point set on the wrong route).
export const MAX_ETA_ROAD_KM = 700

export interface Eta {
  /** Whole minutes, at least 1. 0 only when arriving. */
  minutes: number
  /** Straight-line distance to the pickup point, in km, one decimal. */
  distanceKm: number
  /** SPEED: worked out from how fast the bus is going. AVERAGE: the bus is slow or its speed is unknown, so 40 km/h is assumed. */
  basis: 'SPEED' | 'AVERAGE'
  arriving: boolean
}

/** Straight-line distance between two points on the earth, in km (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function estimateEta(
  position: { lat: number; lng: number; speed: number | null; ageSeconds: number },
  pickup: { lat: number; lng: number }
): Eta | null {
  if (position.ageSeconds > FRESH_POSITION_SECONDS) return null
  const straight = distanceKm(position, pickup)
  const rounded = Math.round(straight * 10) / 10
  if (straight * 1000 < ARRIVING_METRES) return { minutes: 0, distanceKm: rounded, basis: 'SPEED', arriving: true }

  const road = straight * ROAD_FACTOR
  if (road > MAX_ETA_ROAD_KM) return null

  const reported = position.speed === null ? 0 : position.speed * 3.6
  const moving = reported >= MOVING_KMH
  const kmh = moving ? Math.min(reported, MAX_BUS_KMH) : AVERAGE_BUS_KMH
  return { minutes: Math.max(1, Math.ceil((road / kmh) * 60)), distanceKm: rounded, basis: moving ? 'SPEED' : 'AVERAGE', arriving: false }
}

type PointRow = { name: string; lat: number | null; lng: number | null } | null

/**
 * The pickup point to measure to: the booking's own, else the first passenger's (by seat number)
 * that has a map position. A point without a position cannot be measured to.
 */
export function choosePickup(booking: {
  pickupPoint: PointRow
  passengers: { seatNumber: string; pickupPoint: PointRow }[]
}): PickupPlace | null {
  const usable = (p: PointRow): PickupPlace | null =>
    p && typeof p.lat === 'number' && typeof p.lng === 'number' ? { name: p.name, lat: p.lat, lng: p.lng } : null
  const own = usable(booking.pickupPoint)
  if (own) return own
  const ordered = [...booking.passengers].sort((a, b) => a.seatNumber.localeCompare(b.seatNumber, undefined, { numeric: true }))
  for (const person of ordered) {
    const found = usable(person.pickupPoint)
    if (found) return found
  }
  return null
}

/** What a passenger gets back: the state of the trip and, only while it is live, the position. */
export function shapeTracking(
  trip: {
    startedAt: Date | null
    endedAt: Date | null
    position: { lat: number; lng: number; accuracy: number | null; speed: number | null; heading: number | null; recordedAt: Date } | null
  },
  now: Date = new Date(),
  pickup: PickupPlace | null = null
) {
  const state = tripPhase(trip)
  const p = state === 'LIVE' ? trip.position : null
  const position = p
    ? {
        lat: p.lat,
        lng: p.lng,
        accuracy: p.accuracy,
        speed: p.speed,
        heading: p.heading,
        recordedAt: p.recordedAt,
        // Worked out on the server, so a wrong clock on the passenger's phone can't break "last seen"
        ageSeconds: Math.max(0, Math.floor((now.getTime() - p.recordedAt.getTime()) / 1000)),
      }
    : null
  return {
    state,
    startedAt: trip.startedAt,
    endedAt: trip.endedAt,
    position,
    // The passenger's own pickup point (shown on the map). Only while the trip is on.
    pickup: state === 'ENDED' ? null : pickup,
    eta: position && pickup ? estimateEta(position, pickup) : null,
  }
}
