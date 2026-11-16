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

/** What a passenger gets back: the state of the trip and, only while it is live, the position. */
export function shapeTracking(
  trip: {
    startedAt: Date | null
    endedAt: Date | null
    position: { lat: number; lng: number; accuracy: number | null; speed: number | null; heading: number | null; recordedAt: Date } | null
  },
  now: Date = new Date()
) {
  const state = tripPhase(trip)
  const p = state === 'LIVE' ? trip.position : null
  return {
    state,
    startedAt: trip.startedAt,
    endedAt: trip.endedAt,
    position: p
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
      : null,
  }
}
