import { describe, it, expect } from 'vitest'
import { choosePickup, distanceKm, estimateEta, shapeTracking } from '../src/lib/tracking'
// The passenger's words live in the web app as plain functions (no React), so they are tested here
import { etaMinutesText, passengerView, type PassengerTracking } from '../../web/src/lib/tripTracking'

const BUS = { lat: 9.03, lng: 38.74 }
// 10 km straight north of the bus (1 degree of latitude is about 111.2 km)
const TEN_KM_NORTH = { lat: BUS.lat + 10 / 111.195, lng: BUS.lng }

const fix = (over: Partial<{ speed: number | null; ageSeconds: number }> = {}) => ({ ...BUS, speed: 0, ageSeconds: 10, ...over })

describe('distance between two points', () => {
  it('is about 80 km from Addis Ababa to Adama in a straight line', () => {
    const d = distanceKm({ lat: 9.03, lng: 38.74 }, { lat: 8.54, lng: 39.27 })
    expect(d).toBeGreaterThan(78)
    expect(d).toBeLessThan(82)
  })
  it('is 0 for the same point and the same both ways', () => {
    expect(distanceKm(BUS, BUS)).toBe(0)
    expect(distanceKm(BUS, TEN_KM_NORTH)).toBeCloseTo(distanceKm(TEN_KM_NORTH, BUS), 9)
    expect(distanceKm(BUS, TEN_KM_NORTH)).toBeCloseTo(10, 1)
  })
})

describe('minutes until the bus reaches the pickup point', () => {
  it('uses the bus speed while it is moving (10 km straight, +30% for the road, at 60 km/h: about 13 min)', () => {
    const eta = estimateEta(fix({ speed: 60 / 3.6 }), TEN_KM_NORTH)!
    expect(eta.basis).toBe('SPEED')
    expect(eta.arriving).toBe(false)
    expect(eta.minutes).toBeGreaterThanOrEqual(13)
    expect(eta.minutes).toBeLessThanOrEqual(14)
    expect(eta.distanceKm).toBe(10)
  })

  it('assumes a usual 40 km/h when the bus is stopped, slow, or its speed is unknown, and says so', () => {
    for (const speed of [0, 2, 10 / 3.6, null]) {
      const eta = estimateEta(fix({ speed }), TEN_KM_NORTH)!
      expect(eta.basis).toBe('AVERAGE')
      expect(eta.minutes).toBe(20) // 13 km at 40 km/h = 19.5 min, rounded up
    }
  })

  it('does not believe a speed above 90 km/h', () => {
    const eta = estimateEta(fix({ speed: 100 }), TEN_KM_NORTH)! // 100 m/s = 360 km/h
    expect(eta.minutes).toBe(9) // 13 km at 90 km/h = 8.7 min
  })

  it('says arriving when the bus is within 300 m, and never says 0 minutes otherwise', () => {
    const at = estimateEta(fix(), BUS)!
    expect(at).toMatchObject({ minutes: 0, arriving: true })
    const near = estimateEta(fix({ speed: 20 }), { lat: BUS.lat + 0.0036, lng: BUS.lng })! // about 400 m
    expect(near.arriving).toBe(false)
    expect(near.minutes).toBe(1)
  })

  it('gives no minutes from an old position', () => {
    expect(estimateEta(fix({ ageSeconds: 121 }), TEN_KM_NORTH)).toBeNull()
    expect(estimateEta(fix({ ageSeconds: 120 }), TEN_KM_NORTH)).not.toBeNull()
  })

  it('gives no minutes when the numbers are not believable (a point on the wrong route)', () => {
    expect(estimateEta(fix(), { lat: BUS.lat + 6, lng: BUS.lng })).toBeNull() // about 667 km
  })
})

describe('which pickup point is measured to', () => {
  const point = (name: string, lat: number | null = 9.01, lng: number | null = 38.7) => ({ name, lat, lng })

  it("uses the booking's own pickup point when it has a position", () => {
    expect(choosePickup({ pickupPoint: point('Megenagna'), passengers: [] })).toEqual({ name: 'Megenagna', lat: 9.01, lng: 38.7 })
  })

  it('falls back to the first passenger (by seat number, 2 before 10) that has a position', () => {
    const got = choosePickup({
      pickupPoint: point('No position', null, null),
      passengers: [
        { seatNumber: '10', pickupPoint: point('Ten') },
        { seatNumber: '2', pickupPoint: point('Two') },
        { seatNumber: '1', pickupPoint: point('One', null, null) },
      ],
    })
    expect(got?.name).toBe('Two')
  })

  it('is null when nothing has a position, or there is no pickup point at all', () => {
    expect(choosePickup({ pickupPoint: point('A', null, null), passengers: [{ seatNumber: '1', pickupPoint: null }] })).toBeNull()
    expect(choosePickup({ pickupPoint: null, passengers: [] })).toBeNull()
  })
})

describe('what the server sends a passenger', () => {
  const now = new Date('2026-11-17T10:00:00Z')
  const position = (agoSec: number, speed: number | null = 20) => ({
    ...BUS,
    accuracy: 12,
    speed,
    heading: 90,
    recordedAt: new Date(now.getTime() - agoSec * 1000),
  })
  const place = { name: 'Bole', ...TEN_KM_NORTH }

  it('live and fresh: the pickup point and the minutes', () => {
    const t = shapeTracking({ startedAt: new Date(now.getTime() - 3600_000), endedAt: null, position: position(20) }, now, place)
    expect(t.pickup).toEqual(place)
    expect(t.eta?.minutes).toBeGreaterThan(0)
  })

  it('live but the position is old: the position stays (as last known), the minutes go', () => {
    const t = shapeTracking({ startedAt: new Date(now.getTime() - 3600_000), endedAt: null, position: position(300) }, now, place)
    expect(t.position?.ageSeconds).toBe(300)
    expect(t.eta).toBeNull()
  })

  it('not started: the pickup point is there, no position and no minutes', () => {
    const t = shapeTracking({ startedAt: null, endedAt: null, position: null }, now, place)
    expect(t).toMatchObject({ state: 'NOT_STARTED', position: null, eta: null, pickup: place })
  })

  it('ended: nothing about where anyone is going, even if a position row was left behind', () => {
    const t = shapeTracking({ startedAt: new Date(now.getTime() - 7200_000), endedAt: now, position: position(5) }, now, place)
    expect(t).toMatchObject({ state: 'ENDED', position: null, eta: null, pickup: null })
  })

  it('no pickup point given: no minutes', () => {
    const t = shapeTracking({ startedAt: new Date(now.getTime() - 3600_000), endedAt: null, position: position(5) }, now)
    expect(t.pickup).toBeNull()
    expect(t.eta).toBeNull()
  })
})

describe('the words for the passenger', () => {
  it('does not make an estimate look exact', () => {
    expect(etaMinutesText(1)).toBe('1 min')
    expect(etaMinutesText(7)).toBe('7 min')
    expect(etaMinutesText(12)).toBe('10 min')
    expect(etaMinutesText(13)).toBe('15 min')
    expect(etaMinutesText(58)).toBe('1 h')
    expect(etaMinutesText(75)).toBe('1 h 15 min')
    expect(etaMinutesText(120)).toBe('2 h')
    expect(etaMinutesText(0)).toBe('1 min')
  })

  const live = (over: Partial<PassengerTracking> = {}): PassengerTracking => ({
    state: 'LIVE',
    startedAt: '2026-11-17T08:00:00Z',
    endedAt: null,
    position: { lat: 9.03, lng: 38.74, accuracy: 10, speed: 16, heading: 90, recordedAt: '2026-11-17T10:00:00Z', ageSeconds: 20 },
    pickup: { name: 'Bole Ambassador', lat: 9.1, lng: 38.74 },
    eta: { minutes: 23, distanceKm: 7.8, basis: 'SPEED', arriving: false },
    ...over,
  })

  it('says about how long, to which stop, and that it is an estimate', () => {
    const v = passengerView(live())
    expect(v.etaLine).toBe('About 25 min to Bole Ambassador')
    expect(v.etaNote).toMatch(/estimate/i)
  })

  it('says so when the bus is close, and when it assumed a usual speed', () => {
    expect(passengerView(live({ eta: { minutes: 0, distanceKm: 0.1, basis: 'SPEED', arriving: true } })).etaLine).toBe('The bus is close to Bole Ambassador')
    expect(passengerView(live({ eta: { minutes: 20, distanceKm: 10, basis: 'AVERAGE', arriving: false } })).etaNote).toMatch(/usual bus speed/)
  })

  it('shows no minutes without an estimate, or from an old position', () => {
    expect(passengerView(live({ eta: null })).etaLine).toBeNull()
    const old = passengerView(live(), 200) // 20 s old when answered + 200 s on this screen
    expect(old.headline).toBe('Last known location of the bus')
    expect(old.etaLine).toBeNull()
  })

  it('shows no minutes before the trip starts or after it ends', () => {
    expect(passengerView(live({ state: 'NOT_STARTED', position: null, eta: null })).etaLine).toBeNull()
    expect(passengerView(live({ state: 'ENDED', position: null, eta: null })).etaLine).toBeNull()
  })
})
