import { distanceKm } from './tracking'
import { addisTimeString } from './time'

/**
 * "Your bus is near" alerts: the rules in one place, as plain functions (no database, no
 * network), so the sending code and the tests agree.
 *
 * Who gets what (stops are the pickup points of the trip's route, in order, 0 = the first):
 *  - a passenger at the FIRST pickup point: DEPART_SOON, 30 minutes before the scheduled departure;
 *  - every other passenger: TRIP_STARTED when the checker starts the trip, HALFWAY when the bus
 *    is halfway between the start and the passenger's pickup point, NEXT_STOP when the bus has
 *    reached the pickup point before theirs.
 * Every message names the passenger's pickup point.
 */

export type MovingAlertType = 'TRIP_STARTED' | 'HALFWAY' | 'NEXT_STOP'
export type AlertType = 'DEPART_SOON' | MovingAlertType
export type Lang = 'en' | 'am' | 'om'

/** From least to most advanced. When several are due at once, only the last one is sent. */
export const MOVING_ORDER: readonly MovingAlertType[] = ['TRIP_STARTED', 'HALFWAY', 'NEXT_STOP']

export const DEPART_SOON_MINUTES = 30
// A reminder that is more than this late (the server was asleep) is not sent: it would be stale.
export const DEPART_SOON_LATE_MINUTES = 10
// The bus counts as "at" a pickup point when it is within this distance. The phone reports every
// ~20 s, and a bus at 90 km/h covers 500 m in that time, so a smaller circle could be jumped over.
export const REACHED_METRES = 500
// Only a position this young may trigger an alert. A wrong "your bus is arriving" is worse than none.
export const ALERT_MAX_POSITION_AGE_SECONDS = 120

export interface Stop {
  id: string
  name: string
  lat: number | null
  lng: number | null
}

type PickupRow = Stop & { kind: 'PICKUP' | 'DROPOFF' | 'BOTH'; sequence: number; offsetMin: number }

/** The pickup points where people board, in the order the bus reaches them. */
export function boardingStops(points: PickupRow[]): Stop[] {
  return points
    .filter((p) => p.kind !== 'DROPOFF')
    .sort((a, b) => a.sequence - b.sequence || a.offsetMin - b.offsetMin || a.name.localeCompare(b.name))
    .map(({ id, name, lat, lng }) => ({ id, name, lat, lng }))
}

const hasPlace = (s: Stop): s is Stop & { lat: number; lng: number } => typeof s.lat === 'number' && typeof s.lng === 'number'

/**
 * The stop the bus must reach for an alert to fire. A stop without a map position cannot be
 * detected, so the nearest earlier stop that has one is used (the alert comes a little early,
 * never missing). Null when there is none.
 */
export function detectableAt(stops: Stop[], index: number): number | null {
  for (let i = Math.min(index, stops.length - 1); i >= 0; i--) if (hasPlace(stops[i])) return i
  return null
}

/** Halfway between the start and the passenger's stop. Only for the 4th stop and later: for the 2nd and 3rd it would be the start or the stop right before theirs. */
export function halfwayStop(stopIndex: number): number | null {
  return stopIndex >= 3 ? Math.floor(stopIndex / 2) : null
}

/** The stop before the passenger's. */
export function nextStopStop(stopIndex: number): number | null {
  return stopIndex >= 1 ? stopIndex - 1 : null
}

/**
 * Moves the bus's progress forward. Returns the new furthest stop the bus is within
 * REACHED_METRES of, or null when that is not further than `current`. It never goes back, so GPS
 * jitter can't repeat an alert, and it can jump over stops (a bus that was out of signal).
 */
export function newProgress(
  stops: Stop[],
  position: { lat: number; lng: number },
  current: number | null,
  radiusMetres = REACHED_METRES
): number | null {
  let best: number | null = null
  stops.forEach((s, i) => {
    if (!hasPlace(s)) return
    if (distanceKm(position, s) * 1000 <= radiusMetres) best = i
  })
  return best !== null && best > (current ?? -1) ? best : null
}

/** The moving alerts that are due for a passenger whose pickup point is stop `stopIndex`. */
export function dueMovingAlerts(stops: Stop[], stopIndex: number, progress: number | null): MovingAlertType[] {
  if (stopIndex < 1) return []
  const due: MovingAlertType[] = ['TRIP_STARTED']
  const reached = (target: number | null) => {
    const at = target === null ? null : detectableAt(stops, target)
    return at !== null && progress !== null && progress >= at
  }
  if (reached(halfwayStop(stopIndex))) due.push('HALFWAY')
  if (reached(nextStopStop(stopIndex))) due.push('NEXT_STOP')
  return due
}

/** The bus has already reached (or passed) the passenger's pickup point: nothing is useful any more. */
export const alreadyAtOrPast = (stopIndex: number, progress: number | null) => progress !== null && progress >= stopIndex

/**
 * From what is due and what was already decided: the one alert to send (the most advanced) and
 * the earlier ones to record as skipped. A passenger who booked late, or a bus that jumped ahead,
 * gets ONE message, not three at once.
 */
export function planAlerts(due: MovingAlertType[], done: Set<string>): { send: MovingAlertType | null; skip: MovingAlertType[] } {
  const fresh = MOVING_ORDER.filter((t) => due.includes(t) && !done.has(t))
  if (fresh.length === 0) return { send: null, skip: [] }
  return { send: fresh[fresh.length - 1], skip: fresh.slice(0, -1) }
}

// ─── The words ───────────────────────────────────────────────────────────────

/** "less than 1 km", "3.4 km", "14 km". A straight line, so it is always worded as "about". */
export function distanceText(km: number, lang: Lang): string {
  const unit = lang === 'am' ? 'ኪ.ሜ' : 'km'
  if (km < 1) return lang === 'am' ? `ከ1 ${unit} በታች` : `less than 1 ${unit}`
  const shown = km < 10 ? (Math.round(km * 10) / 10).toString() : Math.round(km).toString()
  return `${shown} ${unit}`
}

/**
 * A time in Addis for a message. English uses AM/PM; Amharic and Afaan Oromo use the 24-hour
 * clock, the same as the website, because "6:30" can be read as Ethiopian clock time.
 */
export function clockText(departure: Date, lang: Lang): string {
  const hhmm = addisTimeString(departure)
  if (lang !== 'en') return hhmm
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export interface MessageInput {
  type: AlertType
  lang: Lang
  pickupName: string
  /** Straight-line km from the bus to the pickup point, or null when the pickup has no map position */
  distanceKm: number | null
  departure?: Date
}

/**
 * The notification text. Afaan Oromo falls back to English until the wording is written by
 * a native speaker. The Amharic is a first draft: have it read by a native speaker before launch.
 */
export function buildMessage({ type, lang, pickupName, distanceKm: km, departure }: MessageInput): { title: string; body: string } {
  const l: Lang = lang === 'am' ? 'am' : 'en'
  const dist = km === null ? null : distanceText(km, l)
  const time = departure ? clockText(departure, l) : ''
  const name = pickupName

  if (l === 'am') {
    const away = dist ? ` ${dist} ያህል ይቀረዋል።` : ''
    const bodies: Record<AlertType, string> = {
      DEPART_SOON: `ወደ ${name} የሚሄዱበት ጊዜ ደርሷል። አውቶቡሱ ${time} ላይ ይነሳል።`,
      TRIP_STARTED: dist ? `አውቶቡስዎ ጉዞ ጀምሯል። ከ${name} ${dist} ያህል ይርቃል።` : `አውቶቡስዎ ጉዞ ጀምሯል። የሚሳፈሩበት ቦታ፦ ${name}።`,
      HALFWAY: `አውቶቡስዎ ወደ ${name} ግማሽ መንገድ ደርሷል።${away}`,
      NEXT_STOP: `አውቶቡስዎ ከ${name} በፊት ያለው ማቆሚያ ደርሷል።${away} ተዘጋጁ።`,
    }
    return { title: 'MugoBus', body: bodies[type] }
  }

  const away = dist ? `, about ${dist} away` : ''
  const bodies: Record<AlertType, string> = {
    DEPART_SOON: `Time to head to ${name}. Your bus is scheduled to leave at ${time}.`,
    TRIP_STARTED: dist ? `Your bus has started its trip. It is about ${dist} from ${name}.` : `Your bus has started its trip. Your pickup point is ${name}.`,
    HALFWAY: `Your bus is halfway to ${name}${away}.`,
    NEXT_STOP: `Your bus is at the stop before ${name}${away}. Get ready.`,
  }
  return { title: 'MugoBus', body: bodies[type] }
}
