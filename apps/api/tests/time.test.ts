import { describe, it, expect } from 'vitest'
import {
  addDaysToDateString,
  addisDateString,
  addisDayRange,
  addisTimeString,
  addisToUtc,
  isValidDateString,
  isValidTimeString,
  weekdayOfDateString,
} from '../src/lib/time'
import { plannedDates } from '../src/lib/recurring'

describe('Addis Ababa time helpers', () => {
  it('turns Addis clock time into UTC (UTC+3, no daylight saving)', () => {
    expect(addisToUtc('2026-11-10', '05:00').toISOString()).toBe('2026-11-10T02:00:00.000Z')
    expect(addisToUtc('2026-07-10', '05:00').toISOString()).toBe('2026-07-10T02:00:00.000Z')
    // Early morning in Addis is still the previous day in UTC
    expect(addisToUtc('2026-11-10', '01:30').toISOString()).toBe('2026-11-09T22:30:00.000Z')
  })

  it('reads the Addis date and time of a moment', () => {
    expect(addisDateString(new Date('2026-11-09T21:00:00Z'))).toBe('2026-11-10')
    expect(addisDateString(new Date('2026-11-09T20:59:59Z'))).toBe('2026-11-09')
    expect(addisTimeString(new Date('2026-11-10T02:00:00Z'))).toBe('05:00')
  })

  it('gives a search day as midnight to midnight in Addis', () => {
    const { start, end } = addisDayRange('2026-11-10')
    expect(start.toISOString()).toBe('2026-11-09T21:00:00.000Z')
    expect(end.toISOString()).toBe('2026-11-10T21:00:00.000Z')
  })

  it('puts a trip at 00:30 Addis on the right day, and one at 23:30 too', () => {
    const { start, end } = addisDayRange('2026-11-10')
    const earlyMorning = addisToUtc('2026-11-10', '00:30')
    const lateNight = addisToUtc('2026-11-10', '23:30')
    const nextMorning = addisToUtc('2026-11-11', '00:30')
    expect(earlyMorning >= start && earlyMorning < end).toBe(true)
    expect(lateNight >= start && lateNight < end).toBe(true)
    expect(nextMorning < end).toBe(false)
  })

  it('handles weekdays and adding days across month ends', () => {
    expect(weekdayOfDateString('2026-11-06')).toBe(5) // Friday
    expect(weekdayOfDateString('2026-11-08')).toBe(0) // Sunday
    expect(addDaysToDateString('2026-11-28', 5)).toBe('2026-12-03')
    expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('validates dates and times', () => {
    expect(isValidDateString('2026-11-10')).toBe(true)
    expect(isValidDateString('2026-02-30')).toBe(false)
    expect(isValidDateString('10/11/2026')).toBe(false)
    expect(isValidTimeString('05:00')).toBe(true)
    expect(isValidTimeString('24:00')).toBe(false)
    expect(isValidTimeString('5:00')).toBe(false)
  })
})

describe('plannedDates (which days get a recurring trip)', () => {
  const everyDay = [0, 1, 2, 3, 4, 5, 6]

  it('covers the next 30 days for a daily schedule', () => {
    const dates = plannedDates(everyDay, new Date('2026-11-10T06:00:00Z'))
    expect(dates).toHaveLength(30)
    expect(dates[0]).toBe('2026-11-10')
    expect(dates[29]).toBe('2026-12-09')
  })

  it('starts from the Addis date, not the UTC date, just after midnight in Addis', () => {
    // 22:00 UTC on Nov 9 is already 01:00 on Nov 10 in Addis Ababa
    const dates = plannedDates(everyDay, new Date('2026-11-09T22:00:00Z'))
    expect(dates[0]).toBe('2026-11-10')
  })

  it('only includes the chosen weekdays', () => {
    // Tuesdays only (Nov 10, 2026 is a Tuesday)
    const dates = plannedDates([2], new Date('2026-11-09T22:00:00Z'))
    expect(dates).toEqual(['2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01', '2026-12-08'])
  })

  it('gives nothing when no days are chosen', () => {
    expect(plannedDates([], new Date())).toEqual([])
  })
})
