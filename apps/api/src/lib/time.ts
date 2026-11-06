/**
 * Addis Ababa time helpers.
 *
 * Trip times are stored in UTC in the database. Ethiopia is UTC+3 all year
 * (no daylight saving), so "05:00 in Addis" is always "02:00 UTC".
 * Never use the server's own time zone for this: Render runs in UTC and a
 * developer PC runs in local time, which gave different answers.
 */

export const ADDIS_OFFSET_MIN = 180
const MIN = 60 * 1000
const DAY_MS = 24 * 60 * MIN

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidDateString(date: string): boolean {
  const m = DATE_RE.exec(date)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

export function isValidTimeString(time: string): boolean {
  return TIME_RE.test(time)
}

/** The Addis calendar day ("YYYY-MM-DD") that a moment falls on. */
export function addisDateString(moment: Date): string {
  return new Date(moment.getTime() + ADDIS_OFFSET_MIN * MIN).toISOString().slice(0, 10)
}

/** The moment (UTC) when an Addis date and clock time ("HH:MM") happen. */
export function addisToUtc(date: string, time = '00:00'): Date {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - ADDIS_OFFSET_MIN * MIN)
}

/** Clock time ("HH:MM") in Addis for a moment. */
export function addisTimeString(moment: Date): string {
  return new Date(moment.getTime() + ADDIS_OFFSET_MIN * MIN).toISOString().slice(11, 16)
}

/** Adds whole days to a "YYYY-MM-DD" date. */
export function addDaysToDateString(date: string, days: number): string {
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d) + days * DAY_MS).toISOString().slice(0, 10)
}

/** 0 = Sunday ... 6 = Saturday, for an Addis calendar date. */
export function weekdayOfDateString(date: string): number {
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
}

/**
 * Start (included) and end (excluded) of an Addis calendar day, as UTC moments.
 * Example: 2026-11-10 is 2026-11-09T21:00Z up to 2026-11-10T21:00Z.
 */
export function addisDayRange(date: string): { start: Date; end: Date } {
  const start = addisToUtc(date, '00:00')
  return { start, end: new Date(start.getTime() + DAY_MS) }
}
