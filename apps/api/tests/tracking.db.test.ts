/**
 * Database tests for live tracking (Patch T1): the ticket checker starts and ends a trip and
 * sends the bus position; a passenger with a paid ticket sees it only while the trip is live.
 * Through the REAL routes over HTTP: route -> permission check -> controller -> database.
 *
 * Only run when TEST_DATABASE_URL is set; refuse to run against DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import dotenv from 'dotenv'
import http from 'http'
import type { AddressInfo } from 'net'
import express from 'express'
import jwt from 'jsonwebtoken'

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

dotenv.config({ path: '../../.env' })
const TEST_URL = process.env.TEST_DATABASE_URL
const NORMAL_URL = process.env.DATABASE_URL

if (TEST_URL && NORMAL_URL && TEST_URL === NORMAL_URL) {
  throw new Error('TEST_DATABASE_URL is the same as DATABASE_URL. Use a separate database or Neon branch.')
}
if (TEST_URL) process.env.DATABASE_URL = TEST_URL
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-only-for-tests'

type Prisma = typeof import('../src/lib/prisma').prisma
let prisma: Prisma
let server: http.Server
let baseUrl = ''

const tag = `TEST-${Date.now()}`
let phoneCounter = 0
const newPhone = () => `09${String((Date.now() % 1000000) * 100 + phoneCounter++).padStart(8, '0').slice(-8)}`
let licenseCounter = 0
let qrCounter = 0
const token = (userId: string, role: string) => jwt.sign({ userId, role }, process.env.JWT_SECRET!)
const HOUR = 3600 * 1000
const MIN = 60 * 1000

async function api(method: string, path: string, tok?: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, body: json as any }
}

const created = { users: new Set<string>(), operators: new Set<string>(), routes: [] as string[] }

async function makeUser(label: string, role: 'CUSTOMER' | 'OPERATOR' | 'ADMIN') {
  const user = await prisma.user.create({ data: { name: `${tag} ${label}`, phone: newPhone(), password: 'x', role } })
  created.users.add(user.id)
  return { user, tok: token(user.id, role) }
}

async function makeStaff(operatorId: string, label: string, role: 'MANAGER' | 'SELLER' | 'CHECKER') {
  const staff = await makeUser(`${label} ${role}`, 'OPERATOR')
  await prisma.operatorStaff.create({ data: { userId: staff.user.id, operatorId, role } })
  return staff
}

async function makeCompany(label: string) {
  const operator = await prisma.operator.create({
    data: { companyName: `${tag} ${label}`, licenseNo: `${tag}-L${licenseCounter++}`, phone: '0900000000', commissionPercent: 5 },
  })
  created.operators.add(operator.id)
  const manager = await makeStaff(operator.id, label, 'MANAGER')
  const checker = await makeStaff(operator.id, label, 'CHECKER')
  const seller = await makeStaff(operator.id, label, 'SELLER')
  const bus = await prisma.bus.create({ data: { operatorId: operator.id, plateNumber: `${tag}-${label}-1`, totalSeats: 20 } })
  return { operator, manager, checker, seller, bus }
}
type Company = Awaited<ReturnType<typeof makeCompany>>

let route: any, A: Company, B: Company

/** A trip of company `c` that leaves `inHours` from now (negative = already left). */
async function makeTrip(c: Company, inHours: number) {
  const dep = new Date(Date.now() + inHours * HOUR)
  return prisma.schedule.create({
    data: { routeId: route.id, busId: c.bus.id, departureTime: dep, arrivalTime: new Date(dep.getTime() + 2 * HOUR), price: 100 },
  })
}

/** A trip that has been started by the real route, so the tests do not depend on a shortcut. */
async function startedTrip(c: Company = A) {
  const trip = await makeTrip(c, -0.5)
  const res = await start(trip.id, c.checker.tok)
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return trip
}

async function makeBooking(userId: string | null, tripId: string, status: 'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'COMPLETED' = 'CONFIRMED') {
  return prisma.booking.create({
    data: { userId, scheduleId: tripId, seatNumbers: ['1'], totalPrice: 100, status, qrCode: `${tag}-qr-${qrCounter++}` },
  })
}

const start = (tripId: string, tok?: string) => api('POST', `/api/v1/checkin/trips/${tripId}/start`, tok)
const end = (tripId: string, tok?: string) => api('POST', `/api/v1/checkin/trips/${tripId}/end`, tok)
const send = (tripId: string, tok: string | undefined, body: unknown) => api('POST', `/api/v1/checkin/trips/${tripId}/location`, tok, body)
const track = (bookingId: string, tok?: string) => api('GET', `/api/v1/bookings/${bookingId}/tracking`, tok)
const storedPosition = (tripId: string) => prisma.tripPosition.findUnique({ where: { scheduleId: tripId } })
const tripRow = (tripId: string) => prisma.schedule.findUnique({ where: { id: tripId } })

const ADDIS = { lat: 9.03, lng: 38.74 }

describe.skipIf(!TEST_URL)('live tracking (database, real routes)', () => {
  let alem: { user: any; tok: string }, bekele: { user: any; tok: string }

  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    const app = express()
    app.use(express.json())
    app.use('/api/v1/bookings', (await import('../src/routes/booking.routes')).default)
    app.use('/api/v1/checkin', (await import('../src/routes/checkin.routes')).default)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    alem = await makeUser('Alem Tesfaye', 'CUSTOMER')
    bekele = await makeUser('Bekele Girma', 'CUSTOMER')
    route = await prisma.route.create({ data: { fromCity: `${tag}-From`, toCity: `${tag}-To`, distanceKm: 100, estimatedDurationMin: 120 } })
    created.routes.push(route.id)
    A = await makeCompany('A')
    B = await makeCompany('B')
  })

  afterAll(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
    if (prisma) {
      const ops = [...created.operators]
      const buses = await prisma.bus.findMany({ where: { operatorId: { in: ops } }, select: { id: true } })
      const trips = await prisma.schedule.findMany({ where: { busId: { in: buses.map((b) => b.id) } }, select: { id: true } })
      const tripIds = trips.map((t) => t.id)
      await prisma.booking.deleteMany({ where: { scheduleId: { in: tripIds } } })
      await prisma.schedule.deleteMany({ where: { id: { in: tripIds } } }) // positions go with their trip
      await prisma.bus.deleteMany({ where: { id: { in: buses.map((b) => b.id) } } })
      await prisma.route.deleteMany({ where: { id: { in: created.routes } } })
      await prisma.operatorStaff.deleteMany({ where: { operatorId: { in: ops } } })
      await prisma.operator.deleteMany({ where: { id: { in: ops } } })
      await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } })
      await prisma.$disconnect()
    }
  })

  describe('starting and ending a trip', () => {
    it('a checker of the company starts the trip, and the trip shows it as started', async () => {
      const trip = await makeTrip(A, -0.5)
      const res = await start(trip.id, A.checker.tok)
      expect(res.status, JSON.stringify(res.body)).toBe(200)
      expect(res.body.data.trip.startedAt).toBeTruthy()
      expect((await tripRow(trip.id))!.startedAt).not.toBeNull()
      // The checker's trip screen gets the same fact
      const detail = await api('GET', `/api/v1/checkin/trips/${trip.id}/passengers`, A.checker.tok)
      expect(detail.body.data.trip.startedAt).toBeTruthy()
      expect(detail.body.data.trip.endedAt).toBeNull()
    })

    it('a manager can start and end a trip too', async () => {
      const trip = await makeTrip(A, -0.5)
      expect((await start(trip.id, A.manager.tok)).status).toBe(200)
      expect((await end(trip.id, A.manager.tok)).status).toBe(200)
    })

    it('a trip cannot be started twice, ended before it started, or restarted after it ended', async () => {
      const trip = await makeTrip(A, -0.5)
      expect((await end(trip.id, A.checker.tok)).status).toBe(409) // not started yet
      expect((await start(trip.id, A.checker.tok)).status).toBe(200)
      const again = await start(trip.id, A.checker.tok)
      expect(again.status).toBe(409)
      expect(again.body.error).toMatch(/already started/i)
      const ended = await end(trip.id, A.checker.tok)
      expect(ended.status).toBe(200)
      expect((await end(trip.id, A.checker.tok)).status).toBe(409)
      const restart = await start(trip.id, A.checker.tok)
      expect(restart.status).toBe(409)
      expect(restart.body.error).toMatch(/already ended/i)
      const row = await tripRow(trip.id)
      expect(row!.endedAt).not.toBeNull()
    })

    it('two checkers pressing Start at the same moment: exactly one wins', async () => {
      const trip = await makeTrip(A, -0.5)
      const results = await Promise.all([start(trip.id, A.checker.tok), start(trip.id, A.manager.tok), start(trip.id, A.checker.tok)])
      expect(results.filter((r) => r.status === 200)).toHaveLength(1)
      expect(results.filter((r) => r.status === 409)).toHaveLength(2)
    })

    it("another company's staff cannot start, end or send a position: the trip looks like it does not exist", async () => {
      const trip = await startedTrip(A)
      const before = await tripRow(trip.id)
      for (const who of [B.checker.tok, B.manager.tok]) {
        expect((await start(trip.id, who)).status).toBe(404)
        expect((await end(trip.id, who)).status).toBe(404)
        expect((await send(trip.id, who, ADDIS)).status).toBe(404)
      }
      expect(await storedPosition(trip.id)).toBeNull()
      expect((await tripRow(trip.id))!.endedAt).toBeNull()
      expect((await tripRow(trip.id))!.startedAt).toEqual(before!.startedAt)
    })

    it('a seller, a customer, and someone not signed in cannot use the checker tracking routes', async () => {
      const trip = await makeTrip(A, -0.5)
      expect((await start(trip.id, A.seller.tok)).status).toBe(403)
      expect((await start(trip.id, alem.tok)).status).toBe(403)
      expect((await start(trip.id)).status).toBe(401)
      expect((await send(trip.id, A.seller.tok, ADDIS)).status).toBe(403)
      expect((await tripRow(trip.id))!.startedAt).toBeNull()
    })

    it('a trip can be started from 3 hours before it leaves until 12 hours after, not earlier or later', async () => {
      const tooEarly = await makeTrip(A, 5)
      const early = await start(tooEarly.id, A.checker.tok)
      expect(early.status).toBe(400)
      expect(early.body.error).toMatch(/3 hours/)
      const tooLate = await makeTrip(A, -13)
      expect((await start(tooLate.id, A.checker.tok)).status).toBe(400)
      expect((await tripRow(tooEarly.id))!.startedAt).toBeNull()
      expect((await tripRow(tooLate.id))!.startedAt).toBeNull()

      const boardingTime = await makeTrip(A, 2)
      expect((await start(boardingTime.id, A.checker.tok)).status).toBe(200)
      const lateStart = await makeTrip(A, -11)
      expect((await start(lateStart.id, A.checker.tok)).status).toBe(200)
    })

    it('a trip that does not exist is a 404, not an error', async () => {
      expect((await start('does-not-exist', A.checker.tok)).status).toBe(404)
    })
  })

  describe('sending the bus position', () => {
    it('is refused before the trip is started, and nothing is stored', async () => {
      const trip = await makeTrip(A, -0.5)
      const res = await send(trip.id, A.checker.tok, ADDIS)
      expect(res.status).toBe(409)
      expect(res.body.error).toMatch(/start the trip/i)
      expect(await storedPosition(trip.id)).toBeNull()
    })

    it('stores the position while the trip is live, and the newest one replaces the older one', async () => {
      const trip = await startedTrip(A)
      const t0 = Date.now() - 60 * 1000
      const first = await send(trip.id, A.checker.tok, { ...ADDIS, accuracy: 12, speed: 18.5, heading: 270, recordedAt: new Date(t0).toISOString() })
      expect(first.status, JSON.stringify(first.body)).toBe(200)
      expect(first.body.data.stored).toBe(true)
      expect(await storedPosition(trip.id)).toMatchObject({ lat: 9.03, lng: 38.74, accuracy: 12, speed: 18.5, heading: 270 })

      const second = await send(trip.id, A.checker.tok, { lat: 9.1, lng: 38.8, recordedAt: new Date(t0 + 20 * 1000).toISOString() })
      expect(second.body.data.stored).toBe(true)
      expect(await prisma.tripPosition.count({ where: { scheduleId: trip.id } })).toBe(1) // one row per trip
      expect(await storedPosition(trip.id)).toMatchObject({ lat: 9.1, lng: 38.8, accuracy: null, speed: null, heading: null })
    })

    it('an older position (a phone catching up after no signal) never moves the bus backwards', async () => {
      const trip = await startedTrip(A)
      const t0 = Date.now() - 2 * MIN
      await send(trip.id, A.checker.tok, { lat: 9.2, lng: 38.9, recordedAt: new Date(t0).toISOString() })
      const older = await send(trip.id, A.checker.tok, { lat: 8.0, lng: 37.0, recordedAt: new Date(t0 - 30 * 1000).toISOString() })
      expect(older.status).toBe(200)
      expect(older.body.data.stored).toBe(false)
      const same = await send(trip.id, A.checker.tok, { lat: 8.5, lng: 37.5, recordedAt: new Date(t0).toISOString() })
      expect(same.body.data.stored).toBe(false)
      expect(await storedPosition(trip.id)).toMatchObject({ lat: 9.2, lng: 38.9 })
    })

    it('rejects positions that are not real coordinates, and stores nothing', async () => {
      const trip = await startedTrip(A)
      const bad: unknown[] = [
        { lat: 91, lng: 38 },
        { lat: -91, lng: 38 },
        { lat: 9, lng: 181 },
        { lat: 9, lng: -181 },
        { lat: '9.03', lng: '38.74' },
        { lat: 9.03 },
        { lng: 38.74 },
        {},
        { lat: 9, lng: 38, speed: -1 },
        { lat: 9, lng: 38, heading: 400 },
        { lat: 9, lng: 38, recordedAt: 'yesterday' },
      ]
      for (const body of bad) {
        const res = await send(trip.id, A.checker.tok, body)
        expect(res.status, JSON.stringify(body)).toBe(400)
      }
      expect(await storedPosition(trip.id)).toBeNull()
    })

    it("refuses a time that is far in the past or in the future (a wrong clock on the phone), accepts a slightly fast clock", async () => {
      const trip = await startedTrip(A)
      const old = await send(trip.id, A.checker.tok, { ...ADDIS, recordedAt: new Date(Date.now() - 7 * HOUR).toISOString() })
      expect(old.status).toBe(400)
      const future = await send(trip.id, A.checker.tok, { ...ADDIS, recordedAt: new Date(Date.now() + 10 * MIN).toISOString() })
      expect(future.status).toBe(400)
      expect(future.body.error).toMatch(/clock/i)
      expect(await storedPosition(trip.id)).toBeNull()
      const slightlyFast = await send(trip.id, A.checker.tok, { ...ADDIS, recordedAt: new Date(Date.now() + 1 * MIN).toISOString() })
      expect(slightlyFast.status).toBe(200)
    })

    it('ending the trip removes the position, and nothing more can be sent', async () => {
      const trip = await startedTrip(A)
      await send(trip.id, A.checker.tok, ADDIS)
      expect(await storedPosition(trip.id)).not.toBeNull()
      expect((await end(trip.id, A.checker.tok)).status).toBe(200)
      expect(await storedPosition(trip.id)).toBeNull()
      const late = await send(trip.id, A.checker.tok, ADDIS)
      expect(late.status).toBe(409)
      expect(late.body.error).toMatch(/ended/i)
      expect(await storedPosition(trip.id)).toBeNull()
    })

    it('is limited to 30 a minute per staff member, and the limit is per person', async () => {
      const busy = await makeStaff(A.operator.id, 'Busy', 'CHECKER')
      const trip = await startedTrip(A)
      const base = Date.now() - 10 * MIN
      let last = 0
      for (let i = 0; i < 31; i++) {
        last = (await send(trip.id, busy.tok, { ...ADDIS, recordedAt: new Date(base + i * 1000).toISOString() })).status
      }
      expect(last).toBe(429)
      // A colleague is not affected
      expect((await send(trip.id, A.checker.tok, ADDIS)).status).toBe(200)
    })
  })

  describe('what a passenger sees', () => {
    it('before the trip starts: the state, and no position', async () => {
      const trip = await makeTrip(A, 1)
      const b = await makeBooking(alem.user.id, trip.id)
      const res = await track(b.id, alem.tok)
      expect(res.status).toBe(200)
      expect(res.body.data.tracking).toMatchObject({ state: 'NOT_STARTED', startedAt: null, endedAt: null, position: null })
    })

    it('after Start but before the first position: live, with no position yet', async () => {
      const trip = await startedTrip(A)
      const b = await makeBooking(alem.user.id, trip.id)
      const res = await track(b.id, alem.tok)
      expect(res.body.data.tracking).toMatchObject({ state: 'LIVE', position: null })
      expect(res.body.data.tracking.startedAt).toBeTruthy()
    })

    it('while live: the position and how old it is, worked out by the server', async () => {
      const trip = await startedTrip(A)
      const b = await makeBooking(alem.user.id, trip.id)
      await send(trip.id, A.checker.tok, { ...ADDIS, speed: 15, heading: 90, recordedAt: new Date(Date.now() - 95 * 1000).toISOString() })
      const res = await track(b.id, alem.tok)
      const p = res.body.data.tracking.position
      expect(res.body.data.tracking.state).toBe('LIVE')
      expect(p).toMatchObject({ lat: 9.03, lng: 38.74, speed: 15, heading: 90 })
      expect(p.ageSeconds).toBeGreaterThanOrEqual(95)
      expect(p.ageSeconds).toBeLessThan(110)
      // Only the position fields: nothing about the company's staff, phone or other passengers
      expect(Object.keys(res.body.data.tracking).sort()).toEqual(['endedAt', 'eta', 'pickup', 'position', 'startedAt', 'state'])
      expect(Object.keys(p).sort()).toEqual(['accuracy', 'ageSeconds', 'heading', 'lat', 'lng', 'recordedAt', 'speed'])
    })

    it('after the checker ends the trip: ended, and no position, even if a row was left behind', async () => {
      const trip = await startedTrip(A)
      const b = await makeBooking(alem.user.id, trip.id)
      await send(trip.id, A.checker.tok, ADDIS)
      await end(trip.id, A.checker.tok)
      const res = await track(b.id, alem.tok)
      expect(res.body.data.tracking).toMatchObject({ state: 'ENDED', position: null })
      // Belt and braces: even a stray row is never shown once the trip has ended
      await prisma.tripPosition.create({ data: { scheduleId: trip.id, lat: 1, lng: 1, recordedAt: new Date() } })
      expect((await track(b.id, alem.tok)).body.data.tracking.position).toBeNull()
    })

    it("someone else's booking, an unpaid or cancelled booking, a walk-in ticket and a missing booking all look the same: not found", async () => {
      const trip = await startedTrip(A)
      await send(trip.id, A.checker.tok, ADDIS)
      const mine = await makeBooking(alem.user.id, trip.id)
      const pending = await makeBooking(alem.user.id, trip.id, 'PENDING')
      const cancelled = await makeBooking(alem.user.id, trip.id, 'CANCELLED')
      const walkIn = await makeBooking(null, trip.id)

      expect((await track(mine.id, bekele.tok)).status).toBe(404)
      expect((await track(pending.id, alem.tok)).status).toBe(404)
      expect((await track(cancelled.id, alem.tok)).status).toBe(404)
      expect((await track(walkIn.id, alem.tok)).status).toBe(404)
      expect((await track('does-not-exist', alem.tok)).status).toBe(404)
      expect((await track(mine.id)).status).toBe(401)
      // ...and the owner of the paid booking does get it
      expect((await track(mine.id, alem.tok)).body.data.tracking.position).not.toBeNull()
    })

    it('a completed booking (boarded and checked in) can still see the live bus', async () => {
      const trip = await startedTrip(A)
      await send(trip.id, A.checker.tok, ADDIS)
      const b = await makeBooking(alem.user.id, trip.id, 'COMPLETED')
      expect((await track(b.id, alem.tok)).body.data.tracking.position).not.toBeNull()
    })

    it('a passenger of one trip never sees the position of another trip', async () => {
      const tripOne = await startedTrip(A)
      const tripTwo = await startedTrip(A)
      await send(tripOne.id, A.checker.tok, { lat: 9.0, lng: 38.0 })
      await send(tripTwo.id, A.checker.tok, { lat: 7.0, lng: 39.0 })
      const b = await makeBooking(alem.user.id, tripOne.id)
      expect((await track(b.id, alem.tok)).body.data.tracking.position).toMatchObject({ lat: 9.0, lng: 38.0 })
    })

    it('polling is limited to 30 a minute per passenger', async () => {
      const carol = await makeUser('Carol Polls', 'CUSTOMER')
      const trip = await makeTrip(A, 1)
      const b = await makeBooking(carol.user.id, trip.id)
      let last = 0
      for (let i = 0; i < 31; i++) last = (await track(b.id, carol.tok)).status
      expect(last).toBe(429)
      expect((await track(b.id, alem.tok)).status).toBe(404) // another passenger is not blocked by Carol's limit
    })
  })
})
