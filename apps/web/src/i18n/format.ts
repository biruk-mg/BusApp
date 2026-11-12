import type { Locale } from './config'
import { translate, translatePlural, hasMessage, type MessageKey } from './translate'

const TZ = 'Africa/Addis_Ababa'

// "2026-11-11" for a moment, as a calendar day in Addis Ababa (used in search links)
export const addisDateKey = (d: Date | string) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ })

const safe = (make: () => string, fallback: () => string) => {
  try { return make() } catch { return fallback() }
}
const dtf = (loc: string, o: Intl.DateTimeFormatOptions, d: Date | string) =>
  new Intl.DateTimeFormat(loc, { timeZone: TZ, ...o }).format(new Date(d))

// English keeps AM/PM. Amharic and Afaan Oromo use the 24-hour clock, because a
// time like "6:30" can be read in Ethiopian clock time (6 hours different) and
// make someone miss the bus. "06:30" and "14:30" can only mean one thing.
export function formatTime(locale: Locale, d: Date | string): string {
  if (locale === 'en') return dtf('en-ET', { hour: '2-digit', minute: '2-digit' }, d)
  return dtf('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, d)
}

// The date in the Ethiopian calendar, e.g. "2 ኅዳር 2019"
export const ethiopianDate = (d: Date | string) =>
  safe(() => dtf('am-ET-u-ca-ethiopic', { day: 'numeric', month: 'long', year: 'numeric' }, d), () => addisDateKey(d))

// A full date. Amharic shows the Ethiopian date and, in brackets, the date other
// documents (like bank messages and tickets from other places) would use.
export function formatDateLong(locale: Locale, d: Date | string): string {
  if (locale === 'am') {
    const eth = safe(() => dtf('am-ET-u-ca-ethiopic', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }, d), () => addisDateKey(d))
    const greg = safe(() => dtf('am-ET', { day: 'numeric', month: 'short', year: 'numeric' }, d), () => addisDateKey(d))
    return `${eth} (${greg})`
  }
  if (locale === 'om') return safe(() => dtf('om-ET', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }, d), () => addisDateKey(d))
  return safe(() => dtf('en-ET', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }, d), () => addisDateKey(d))
}

// A short date, like "Wed, 11 Nov"
export function formatDateShort(locale: Locale, d: Date | string): string {
  if (locale === 'am') return safe(() => dtf('am-ET-u-ca-ethiopic', { weekday: 'short', day: 'numeric', month: 'short' }, d), () => addisDateKey(d))
  if (locale === 'om') return safe(() => dtf('om-ET', { weekday: 'short', day: 'numeric', month: 'short' }, d), () => addisDateKey(d))
  return safe(() => dtf('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }, d), () => addisDateKey(d))
}

// Whole birr without ".00"; the unit is "ETB", "ብር" or "Birrii"
export function formatPrice(locale: Locale, amount: number): string {
  const digits = Number.isInteger(amount) ? 0 : 2
  const n = amount.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: 2 })
  return `${translate(locale, 'common.etb')} ${n}`
}

export function formatDuration(locale: Locale, minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return translate(locale, 'common.duration.m', { m })
  return m === 0 ? translate(locale, 'common.duration.h', { h }) : translate(locale, 'common.duration.hm', { h, m })
}

// "Today, 06:30", "Tomorrow, 06:30" or "Fri, 13 Nov, 06:30" (all in Addis time)
export function formatNext(locale: Locale, iso: string, now: Date = new Date()): string {
  const time = formatTime(locale, iso)
  const toDay = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  const diff = Math.round((toDay(addisDateKey(iso)) - toDay(addisDateKey(now))) / 86400000)
  if (diff <= 0) return `${translate(locale, 'common.today')}, ${time}`
  if (diff === 1) return `${translate(locale, 'common.tomorrow')}, ${time}`
  return `${formatDateShort(locale, iso)}, ${time}`
}

export const busTypeName = (locale: Locale, type: string) => {
  const key = `busType.${type}`
  return hasMessage(key) ? translate(locale, key as MessageKey) : type
}

export { translatePlural }
