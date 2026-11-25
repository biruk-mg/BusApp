import { describe, it, expect } from 'vitest'
import {
  boardingStops,
  halfwayStop,
  nextStopStop,
  detectableAt,
  newProgress,
  dueMovingAlerts,
  alreadyAtOrPast,
  planAlerts,
  distanceText,
  clockText,
  buildMessage,
  type Stop,
} from '../src/lib/arrivalAlerts'

// Eight stops in a line, 5 km apart, heading east from Addis
const stop = (i: number, extra: Partial<Stop> = {}): Stop => ({ id: `s${i}`, name: `Stop ${i}`, lat: 9.0, lng: 38.7 + i * 0.045, ...extra })
const eight = Array.from({ length: 8 }, (_, i) => stop(i))
const at = (i: number) => ({ lat: eight[i].lat!, lng: eight[i].lng! })

describe('boardingStops', () => {
  it('orders by sequence, then offset, and leaves drop-off-only points out', () => {
    const rows = [
      { id: 'c', name: 'C', lat: null, lng: null, kind: 'PICKUP' as const, sequence: 2, offsetMin: 0 },
      { id: 'x', name: 'X', lat: null, lng: null, kind: 'DROPOFF' as const, sequence: 1, offsetMin: 0 },
      { id: 'a', name: 'A', lat: null, lng: null, kind: 'BOTH' as const, sequence: 0, offsetMin: 30 },
      { id: 'b', name: 'B', lat: null, lng: null, kind: 'PICKUP' as const, sequence: 0, offsetMin: 10 },
    ]
    expect(boardingStops(rows).map((s) => s.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('which stop each alert waits for (option B: halfway to the passenger\'s own pickup)', () => {
  it('a passenger at stop 7 of 8 gets halfway at stop 3 and next-stop at stop 6', () => {
    expect(halfwayStop(7)).toBe(3)
    expect(nextStopStop(7)).toBe(6)
  })
  it('the 2nd and 3rd stops have no halfway alert (it would be the start, or the stop right before)', () => {
    expect([0, 1, 2].map(halfwayStop)).toEqual([null, null, null])
    expect(halfwayStop(3)).toBe(1)
  })
  it('the first stop has no moving alerts at all', () => {
    expect(nextStopStop(0)).toBeNull()
    expect(dueMovingAlerts(eight, 0, 5)).toEqual([])
  })
})

describe('detectableAt (a stop with no map position cannot be detected)', () => {
  it('uses the nearest earlier stop that has a position', () => {
    const stops = [stop(0), stop(1, { lat: null, lng: null }), stop(2, { lat: null, lng: null }), stop(3)]
    expect(detectableAt(stops, 2)).toBe(0)
    expect(detectableAt(stops, 3)).toBe(3)
  })
  it('is null when nothing earlier has a position', () => {
    expect(detectableAt([stop(0, { lat: null, lng: null }), stop(1)], 0)).toBeNull()
  })
})

describe('newProgress', () => {
  it('moves forward when the bus is within 500 m of a stop', () => {
    expect(newProgress(eight, at(0), null)).toBe(0)
    expect(newProgress(eight, at(3), 0)).toBe(3)
  })
  it('never goes backward and never repeats', () => {
    expect(newProgress(eight, at(2), 3)).toBeNull()
    expect(newProgress(eight, at(3), 3)).toBeNull()
  })
  it('can jump over stops (a bus that was out of signal)', () => {
    expect(newProgress(eight, at(6), 1)).toBe(6)
  })
  it('does nothing between stops', () => {
    const between = { lat: 9.0, lng: (eight[2].lng! + eight[3].lng!) / 2 }
    expect(newProgress(eight, between, 2)).toBeNull()
  })
  it('ignores stops without a map position', () => {
    expect(newProgress([stop(0, { lat: null, lng: null })], at(0), null)).toBeNull()
  })
})

describe('dueMovingAlerts and planAlerts for a passenger at stop 7', () => {
  it('only the start alert is due before the bus has reached stop 3', () => {
    expect(dueMovingAlerts(eight, 7, null)).toEqual(['TRIP_STARTED'])
    expect(dueMovingAlerts(eight, 7, 2)).toEqual(['TRIP_STARTED'])
  })
  it('halfway becomes due at stop 3, next-stop at stop 6', () => {
    expect(dueMovingAlerts(eight, 7, 3)).toEqual(['TRIP_STARTED', 'HALFWAY'])
    expect(dueMovingAlerts(eight, 7, 6)).toEqual(['TRIP_STARTED', 'HALFWAY', 'NEXT_STOP'])
  })
  it('a passenger at stop 1 gets next-stop as soon as the bus is at stop 0', () => {
    expect(dueMovingAlerts(eight, 1, 0)).toEqual(['TRIP_STARTED', 'NEXT_STOP'])
  })
  it('sends only the most advanced due alert and records the earlier ones as skipped', () => {
    expect(planAlerts(['TRIP_STARTED', 'HALFWAY', 'NEXT_STOP'], new Set())).toEqual({ send: 'NEXT_STOP', skip: ['TRIP_STARTED', 'HALFWAY'] })
  })
  it('does not send what was already decided', () => {
    expect(planAlerts(['TRIP_STARTED', 'HALFWAY'], new Set(['TRIP_STARTED']))).toEqual({ send: 'HALFWAY', skip: [] })
    expect(planAlerts(['TRIP_STARTED'], new Set(['TRIP_STARTED']))).toEqual({ send: null, skip: [] })
  })
  it('knows when the bus is at or past the passenger\'s stop', () => {
    expect(alreadyAtOrPast(7, 6)).toBe(false)
    expect(alreadyAtOrPast(7, 7)).toBe(true)
    expect(alreadyAtOrPast(7, null)).toBe(false)
  })
})

describe('the words', () => {
  it('distance: whole km from 10, one decimal under 10, "less than 1 km" under 1', () => {
    expect(distanceText(14.4, 'en')).toBe('14 km')
    expect(distanceText(3.46, 'en')).toBe('3.5 km')
    expect(distanceText(0.4, 'en')).toBe('less than 1 km')
  })
  it('clock: 12-hour in English, 24-hour in Amharic and Afaan Oromo (never Ethiopian clock time)', () => {
    const seven = new Date('2026-11-26T04:00:00Z') // 07:00 in Addis
    expect(clockText(seven, 'en')).toBe('7:00 AM')
    expect(clockText(seven, 'am')).toBe('07:00')
    expect(clockText(new Date('2026-11-26T11:30:00Z'), 'en')).toBe('2:30 PM')
  })
  it('EVERY alert names the pickup point, in every language', () => {
    for (const lang of ['en', 'am', 'om'] as const) {
      for (const type of ['DEPART_SOON', 'TRIP_STARTED', 'HALFWAY', 'NEXT_STOP'] as const) {
        for (const distanceKm of [null, 12.3]) {
          const { body } = buildMessage({ type, lang, pickupName: 'Lafto', distanceKm, departure: new Date('2026-11-26T04:00:00Z') })
          expect(body, `${lang} ${type} ${distanceKm}`).toContain('Lafto')
        }
      }
    }
  })
  it('the moving alerts include the distance when the pickup has a map position', () => {
    for (const type of ['TRIP_STARTED', 'HALFWAY', 'NEXT_STOP'] as const) {
      expect(buildMessage({ type, lang: 'en', pickupName: 'Lafto', distanceKm: 14.4 }).body).toContain('14 km')
      expect(buildMessage({ type, lang: 'am', pickupName: 'Lafto', distanceKm: 14.4 }).body).toContain('14')
    }
  })
  it('the departure reminder has the time and no distance', () => {
    const { body } = buildMessage({ type: 'DEPART_SOON', lang: 'en', pickupName: 'Mexico', distanceKm: null, departure: new Date('2026-11-26T04:00:00Z') })
    expect(body).toBe('Time to head to Mexico. Your bus is scheduled to leave at 7:00 AM.')
  })
  it('Afaan Oromo falls back to English', () => {
    expect(buildMessage({ type: 'HALFWAY', lang: 'om', pickupName: 'Lafto', distanceKm: 5 }).body).toBe(buildMessage({ type: 'HALFWAY', lang: 'en', pickupName: 'Lafto', distanceKm: 5 }).body)
  })
})
