/**
 * Database tests for the "your bus is near" alerts: the real rules, the real database and the real
 * routes, with a fake phone-notification channel that records what would have been sent.
 *
 * Only run when TEST_DATABASE_URL is set; refuse to run against DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
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
let onLocation: typeof import('../src/lib/arrivalAlertRunner').onLocation
let runDepartSoon: typeof import('../src/lib/arrivalAlertRunner').runDepartSoon
let setChannelForTests: typeof import('../src/lib/pushChannel').setChannelForTests

const tag = `TEST-${Date.now()}`
let counter = 0
const uniq = () => counter++
const token = (userId: string, role: string) => jwt.sign({ userId, role }, process.env.JWT_SECRET!)
const HOUR = 3600 * 1000
const MIN = 60 * 1000

async function api(method: string, path: string, tok?: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any }
}

// ─── A fake phone-notification channel ───────────────────────────────────────
interface Sent { endpoint: string; title: string; body: string; url: string; tag: string }
let sent: Sent[] = []
let behaviour: Record<string, 'OK' | 'GONE' | 'FAILED'> = {}
let delayMs = 0
const fakeChannel = {
  async send(target: { endpoint: string }, note: { title: string; body: string; url: string; tag: string }) {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    const result = behaviour[target.endpoint] ?? 'OK'
    if (result === 'OK') sent.push({ endpoint: target.endpoint, ...note })
    return result
  },
}
const bodiesTo = (endpoint: string) => sent.filter((s) => s.endpoint === endpoint).map((s) => s.body)

// ─── Test data ───────────────────────────────────────────────────────────────
const created = { users: new Set<string>(), operators: new Set<string>(), routes: [] as string[] }

async function makeUser(label: string, role: 'CUSTOMER' | 'OPERATOR' = 'CUSTOMER') {
  const user = await prisma.user.create({ data: { name: `${tag} ${label}`, phone: `09${String((Date.now() % 1000000) * 100 + uniq()).padStart(8, '0').slice(-8)}`, password: 'x', role } })
  created.users.add(user.id)
  return { user, tok: token(user.id, role) }
}

/** A customer with one phone that agreed to notifications */
async function makeSubscriber(label: string, lang = 'en') {
  const u = await makeUser(label)
  const endpoint = `https://push.example.test/${tag}/${uniq()}`
  await prisma.pushSubscription.create({ data: { userId: u.user.id, endpoint, p256dh: 'p256dh-key-for-tests', auth: 'auth-key', lang } })
  return { ...u, endpoint }
}

let route: any
let company: { operator: any; bus: any; checker: { user: any; tok: string } }
// Eight stops in a line heading east, about 5 km apart
let stops: { id: string; name: string; lat: number; lng: number }[] = []
const STOP_LNG = (i: number) => 38.7 + i * 0.045
const at = (i: number) => ({ lat: 9.0, lng: STOP_LNG(i) })

async function makeCompany() {
  const operator = await prisma.operator.create({ data: { companyName: `${tag} Co`, licenseNo: `${tag}-L${uniq()}`, phone: '0900000000' } })
  created.operators.add(operator.id)
  const checkerUser = await makeUser('Checker', 'OPERATOR')
  await prisma.operatorStaff.create({ data: { userId: checkerUser.user.id, operatorId: operator.id, role: 'CHECKER' } })
  const bus = await prisma.bus.create({ data: { operatorId: operator.id, plateNumber: `${tag}-${uniq()}`, totalSeats: 20 } })
  return { operator, bus, checker: checkerUser }
}

/** A trip that left `startedMinAgo` minutes ago (null = not started yet) and departs `departsInMin` from now. */
async function makeTrip(opts: { departsInMin: number; started?: boolean; ended?: boolean }) {
  const dep = new Date(Date.now() + opts.departsInMin * MIN)
  return prisma.schedule.create({
    data: {
      routeId: route.id,
      busId: company.bus.id,
      departureTime: dep,
      arrivalTime: new Date(dep.getTime() + 2 * HOUR),
      price: 100,
      startedAt: opts.started ? new Date(Date.now() - 5 * MIN) : null,
      endedAt: opts.ended ? new Date() : null,
    },
  })
}
const liveTrip = () => makeTrip({ departsInMin: -5, started: true })

const setPosition = (scheduleId: string, p: { lat: number; lng: number }, recordedAt = new Date()) =>
  prisma.tripPosition.upsert({ where: { scheduleId }, create: { scheduleId, ...p, recordedAt }, update: { ...p, recordedAt } })

async function makeBooking(
  userId: string | null,
  scheduleId: string,
  pickups: (number | null)[],
  opts: { status?: 'CONFIRMED' | 'PENDING' | 'CANCELLED'; source?: 'ONLINE' | 'COUNTER'; createdAt?: Date; boarded?: boolean[] } = {}
) {
  return prisma.booking.create({
    data: {
      userId,
      scheduleId,
      seatNumbers: pickups.map((_, i) => String(i + 1)),
      totalPrice: 100 * pickups.length,
      status: opts.status ?? 'CONFIRMED',
      source: opts.source ?? 'ONLINE',
      qrCode: `${tag}-qr-${uniq()}`,
      pickupPointId: pickups[0] === null ? null : stops[pickups[0]!].id,
      createdAt: opts.createdAt,
      passengers: {
        create: pickups.map((p, i) => ({
          seatNumber: String(i + 1),
          name: `Passenger ${i + 1}`,
          pickupPointId: p === null ? null : stops[p].id,
          boardedAt: opts.boarded?.[i] ? new Date() : null,
        })),
      },
    },
  })
}

const alertRows = (bookingId: string) => prisma.arrivalAlert.findMany({ where: { bookingId }, orderBy: { type: 'asc' } })
const statusOf = async (bookingId: string) => Object.fromEntries((await alertRows(bookingId)).map((a) => [a.type, a.status]))

async function waitFor(check: () => boolean | Promise<boolean>, ms = 4000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, 40))
  }
  return false
}

describe.skipIf(!TEST_URL)('arrival alerts (database, real rules, fake phone channel)', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    ;({ onLocation, runDepartSoon } = await import('../src/lib/arrivalAlertRunner'))
    ;({ setChannelForTests } = await import('../src/lib/pushChannel'))
    setChannelForTests(fakeChannel)

    const app = express()
    app.use(express.json())
    app.use('/api/v1/checkin', (await import('../src/routes/checkin.routes')).default)
    app.use('/api/v1/push', (await import('../src/routes/push.routes')).default)
    app.use('/api/v1/internal', (await import('../src/routes/internal.routes')).default)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    route = await prisma.route.create({ data: { fromCity: `${tag}-From`, toCity: `${tag}-To`, distanceKm: 100, estimatedDurationMin: 120 } })
    created.routes.push(route.id)
    company = await makeCompany()
    for (let i = 0; i < 8; i++) {
      const p = await prisma.pickupPoint.create({
        data: { operatorId: company.operator.id, routeId: route.id, name: `Stop ${i}`, sequence: i, offsetMin: i * 10, lat: 9.0, lng: STOP_LNG(i) },
      })
      stops.push({ id: p.id, name: p.name, lat: 9.0, lng: STOP_LNG(i) })
    }
    // A drop-off-only point never counts as a boarding stop
    await prisma.pickupPoint.create({ data: { operatorId: company.operator.id, routeId: route.id, name: 'Drop only', kind: 'DROPOFF', sequence: 1, offsetMin: 5, lat: 9.0, lng: 38.75 } })
  })

  beforeEach(() => {
    sent = []
    behaviour = {}
    delayMs = 0
    setChannelForTests(fakeChannel)
  })

  afterAll(async () => {
    setChannelForTests(undefined)
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
    if (prisma) {
      const ops = [...created.operators]
      const buses = await prisma.bus.findMany({ where: { operatorId: { in: ops } }, select: { id: true } })
      const trips = await prisma.schedule.findMany({ where: { busId: { in: buses.map((b) => b.id) } }, select: { id: true } })
      const tripIds = trips.map((t) => t.id)
      await prisma.booking.deleteMany({ where: { scheduleId: { in: tripIds } } })
      await prisma.schedule.deleteMany({ where: { id: { in: tripIds } } })
      await prisma.bus.deleteMany({ where: { id: { in: buses.map((b) => b.id) } } })
      await prisma.route.deleteMany({ where: { id: { in: created.routes } } })
      await prisma.operatorStaff.deleteMany({ where: { operatorId: { in: ops } } })
      await prisma.operator.deleteMany({ where: { id: { in: ops } } })
      await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } })
      await prisma.$disconnect()
    }
  })

  describe('while the trip is live', () => {
    it('a passenger at stop 7 gets: trip started, halfway (at stop 3), next stop (at stop 6) - each once, with the pickup name and distance', async () => {
      const trip = await liveTrip()
      const p = await makeSubscriber('Alem')
      const booking = await makeBooking(p.user.id, trip.id, [7])

      await setPosition(trip.id, at(0))
      await onLocation(trip.id)
      expect(bodiesTo(p.endpoint)).toHaveLength(1)
      expect(bodiesTo(p.endpoint)[0]).toMatch(/started/i)
      expect(bodiesTo(p.endpoint)[0]).toContain('Stop 7')
      expect(bodiesTo(p.endpoint)[0]).toMatch(/\d+ km/)

      await setPosition(trip.id, at(2)) // not halfway yet
      await onLocation(trip.id)
      expect(sent).toHaveLength(1)

      await setPosition(trip.id, at(3))
      await onLocation(trip.id)
      expect(bodiesTo(p.endpoint)[1]).toMatch(/halfway to Stop 7, about \d+(\.\d)? km away/)

      await setPosition(trip.id, at(6))
      await onLocation(trip.id)
      expect(bodiesTo(p.endpoint)[2]).toMatch(/stop before Stop 7/)

      // Asking again, and the bus arriving, send nothing more
      await onLocation(trip.id)
      await setPosition(trip.id, at(7))
      await onLocation(trip.id)
      expect(sent).toHaveLength(3)
      expect(await statusOf(booking.id)).toEqual({ TRIP_STARTED: 'SENT', HALFWAY: 'SENT', NEXT_STOP: 'SENT' })
      // The notification opens the live map of this booking, and a newer one replaces an older one
      expect(sent.every((s) => s.url === `/track/${booking.id}` && s.tag === `trip-${booking.id}`)).toBe(true)
    })

    it('a bus that was out of signal and jumps ahead sends ONE alert (the latest), and records the others as skipped', async () => {
      const trip = await liveTrip()
      const p = await makeSubscriber('Bekele')
      const booking = await makeBooking(p.user.id, trip.id, [7])
      await setPosition(trip.id, at(6))
      await onLocation(trip.id)
      expect(sent).toHaveLength(1)
      expect(sent[0].body).toMatch(/stop before Stop 7/)
      expect(await statusOf(booking.id)).toEqual({ TRIP_STARTED: 'SKIPPED', HALFWAY: 'SKIPPED', NEXT_STOP: 'SENT' })
    })

    it('a passenger at stop 1 hears "next stop" as soon as the bus is at stop 0, not two messages', async () => {
      const trip = await liveTrip()
      const p = await makeSubscriber('Chala')
      await makeBooking(p.user.id, trip.id, [1])
      await setPosition(trip.id, at(0))
      await onLocation(trip.id)
      expect(sent).toHaveLength(1)
      expect(sent[0].body).toMatch(/stop before Stop 1/)
    })

    it('a passenger at the first stop gets no moving alerts (the departure reminder is theirs)', async () => {
      const trip = await liveTrip()
      const p = await makeSubscriber('Dawit')
      const booking = await makeBooking(p.user.id, trip.id, [0])
      await setPosition(trip.id, at(0))
      await onLocation(trip.id)
      expect(sent).toHaveLength(0)
      expect(await alertRows(booking.id)).toHaveLength(0)
    })

    it('a booking with passengers at different stops gets an alert for each stop, naming each', async () => {
      const trip = await liveTrip()
      const p = await makeSubscriber('Eden')
      await makeBooking(p.user.id, trip.id, [5, 7])
      await setPosition(trip.id, at(0))
      await onLocation(trip.id)
      const bodies = bodiesTo(p.endpoint)
      expect(bodies).toHaveLength(2)
      expect(bodies.some((b) => b.includes('Stop 5'))).toBe(true)
      expect(bodies.some((b) => b.includes('Stop 7'))).toBe(true)
    })

    it('nobody is alerted who should not be: cancelled, unpaid, counter, boarded, no subscription, or already passed', async () => {
      const trip = await liveTrip()
      const none = await makeUser('No phone')
      const cancelled = await makeSubscriber('Cancelled')
      const pending = await makeSubscriber('Pending')
      const counter = await makeSubscriber('Counter')
      const boarded = await makeSubscriber('Boarded')
      const passed = await makeSubscriber('Passed')
      const good = await makeSubscriber('Good')
      await makeBooking(none.user.id, trip.id, [7])
      await makeBooking(cancelled.user.id, trip.id, [7], { status: 'CANCELLED' })
      await makeBooking(pending.user.id, trip.id, [7], { status: 'PENDING' })
      await makeBooking(counter.user.id, trip.id, [7], { source: 'COUNTER' })
      await makeBooking(boarded.user.id, trip.id, [7], { boarded: [true] })
      const passedBooking = await makeBooking(passed.user.id, trip.id, [2])
      await makeBooking(good.user.id, trip.id, [7])

      await setPosition(trip.id, at(4)) // the bus is already beyond stop 2
      await onLocation(trip.id)
      expect(sent.map((s) => s.endpoint)).toEqual([good.endpoint])
      // The passenger whose stop is behind the bus is not asked again either
      expect(await statusOf(passedBooking.id)).toEqual({ TRIP_STARTED: 'SKIPPED', HALFWAY: 'SKIPPED', NEXT_STOP: 'SKIPPED' })
    })

    it('an alert goes only to the account that owns the booking', async () => {
      const trip = await liveTrip()
      const owner = await makeSubscriber('Owner')
      const stranger = await makeSubscriber('Stranger')
      await makeBooking(owner.user.id, trip.id, [7])
      await setPosition(trip.id, at(0))
      await onLocation(trip.id)
      expect(bodiesTo(owner.endpoint)).toHaveLength(1)
      expect(bodiesTo(stranger.endpoint)).toHaveLength(0)
    })

    it('sends nothing for a stale position, a trip that has not started, a trip that has ended, or when alerts are off', async () => {
      const p = await makeSubscriber('Fikru')
      const stale = await liveTrip()
      await makeBooking(p.user.id, stale.id, [7])
      await setPosition(stale.id, at(0), new Date(Date.now() - 5 * MIN))
      await onLocation(stale.id)

      const notStarted = await makeTrip({ departsInMin: 60 })
      await makeBooking(p.user.id, notStarted.id, [7])
      await setPosition(notStarted.id, at(0))
      await onLocation(notStarted.id)

      const ended = await makeTrip({ departsInMin: -60, started: true, ended: true })
      await makeBooking(p.user.id, ended.id, [7])
      await setPosition(ended.id, at(0))
      await onLocation(ended.id)
      expect(sent).toHaveLength(0)

      const off = await liveTrip()
      await makeBooking(p.user.id, off.id, [7])
      await setPosition(off.id, at(0))
      setChannelForTests(null)
      await onLocation(off.id)
      expect(sent).toHaveLength(0)
    })

    it('the bus never goes backward: a late position from earlier on the road does not repeat anything', async () => {
      const trip = await liveTrip()
      const p = await makeSubscriber('Genet')
      await makeBooking(p.user.id, trip.id, [7])
      await setPosition(trip.id, at(3))
      await onLocation(trip.id) // one alert (the latest due: halfway)
      await setPosition(trip.id, at(1))
      await onLocation(trip.id)
      expect(sent).toHaveLength(1)
      expect((await prisma.schedule.findUnique({ where: { id: trip.id } }))!.pickupProgress).toBe(3)
    })

    it('two requests that both saw the alert as due at the same moment send it once (the claim decides)', async () => {
      const trip = await liveTrip()
      const p = await makeSubscriber('Hana')
      const booking = await makeBooking(p.user.id, trip.id, [7])
      await setPosition(trip.id, at(0))

      // A barrier: both requests read the bookings BEFORE either one claims anything, which is
      // the worst case (without it, the second request would usually see the first one's row).
      let arrived = 0
      let release!: () => void
      const gate = new Promise<void>((r) => (release = r))
      const real = prisma.booking.findMany.bind(prisma.booking)
      const spy = vi.spyOn(prisma.booking, 'findMany').mockImplementation((async (args: any) => {
        const rows = await real(args)
        if (++arrived >= 2) release()
        await gate
        return rows
      }) as any)
      try {
        await Promise.all([onLocation(trip.id), onLocation(trip.id)])
      } finally {
        spy.mockRestore()
      }
      expect(arrived).toBe(2)
      expect(sent).toHaveLength(1)
      expect(await alertRows(booking.id)).toHaveLength(1)
    })

    it('every phone of the account gets it; a phone that is gone is forgotten; if none can be reached it is recorded as failed', async () => {
      const trip = await liveTrip()
      const p = await makeSubscriber('Iyob')
      const second = `https://push.example.test/${tag}/second-${uniq()}`
      await prisma.pushSubscription.create({ data: { userId: p.user.id, endpoint: second, p256dh: 'p256dh-key-for-tests', auth: 'auth-key', lang: 'am' } })
      const booking = await makeBooking(p.user.id, trip.id, [7])
      await setPosition(trip.id, at(0))
      await onLocation(trip.id)
      expect(bodiesTo(p.endpoint)[0]).toMatch(/Your bus has started/) // English phone
      expect(bodiesTo(second)[0]).toContain('Stop 7') // Amharic phone, same pickup name
      expect(bodiesTo(second)[0]).not.toMatch(/Your bus/)

      // Now every phone is dead
      behaviour = { [p.endpoint]: 'GONE', [second]: 'FAILED' }
      await setPosition(trip.id, at(3))
      await onLocation(trip.id)
      expect(await prisma.pushSubscription.findUnique({ where: { endpoint: p.endpoint } })).toBeNull() // gone: deleted
      expect(await prisma.pushSubscription.findUnique({ where: { endpoint: second } })).not.toBeNull() // failed: kept
      expect((await statusOf(booking.id)).HALFWAY).toBe('FAILED')
    })
  })

  describe('the checker\'s phone sending a position (the real route)', () => {
    it('triggers the alert after the answer, and the checker\'s answer does not wait for it', async () => {
      const trip = await makeTrip({ departsInMin: -5 })
      const p = await makeSubscriber('Jemal')
      await makeBooking(p.user.id, trip.id, [7])
      expect((await api('POST', `/api/v1/checkin/trips/${trip.id}/start`, company.checker.tok)).status).toBe(200)

      delayMs = 600 // a slow push service
      const t0 = Date.now()
      const res = await api('POST', `/api/v1/checkin/trips/${trip.id}/location`, company.checker.tok, at(0))
      expect(res.status).toBe(200)
      expect(Date.now() - t0).toBeLessThan(500)
      expect(await waitFor(() => sent.length === 1)).toBe(true)
      expect(sent[0].body).toContain('Stop 7')
    })
  })

  describe('30 minutes before departure (first stop)', () => {
    it('reminds a passenger at the first stop once, with the time and the pickup name; running again sends nothing', async () => {
      const trip = await makeTrip({ departsInMin: 25 })
      const p = await makeSubscriber('Kebede')
      const booking = await makeBooking(p.user.id, trip.id, [0], { createdAt: new Date(Date.now() - 3 * HOUR) })
      await runDepartSoon()
      expect(sent).toHaveLength(1)
      expect(sent[0].body).toMatch(/^Time to head to Stop 0\. Your bus is scheduled to leave at \d{1,2}:\d{2} (AM|PM)\.$/)
      await runDepartSoon()
      expect(sent).toHaveLength(1)
      expect(await statusOf(booking.id)).toEqual({ DEPART_SOON: 'SENT' })
    })

    it('does not remind: a trip more than 30 minutes away, a trip already started, or a passenger at a later stop', async () => {
      const p = await makeSubscriber('Lemma')
      const far = await makeTrip({ departsInMin: 45 })
      await makeBooking(p.user.id, far.id, [0], { createdAt: new Date(Date.now() - 3 * HOUR) })
      const started = await makeTrip({ departsInMin: 20, started: true })
      await makeBooking(p.user.id, started.id, [0], { createdAt: new Date(Date.now() - 3 * HOUR) })
      const later = await makeTrip({ departsInMin: 25 })
      await makeBooking(p.user.id, later.id, [3], { createdAt: new Date(Date.now() - 3 * HOUR) })
      await runDepartSoon()
      expect(sent).toHaveLength(0)
    })

    it('a booking made after the 30-minute mark (already on the way) is skipped, not reminded', async () => {
      const trip = await makeTrip({ departsInMin: 25 })
      const p = await makeSubscriber('Mulu')
      const booking = await makeBooking(p.user.id, trip.id, [0], { createdAt: new Date(Date.now() - 2 * MIN) })
      await runDepartSoon()
      expect(sent).toHaveLength(0)
      expect(await statusOf(booking.id)).toEqual({ DEPART_SOON: 'SKIPPED' })
    })

    it('a reminder that is more than 10 minutes late (the server was asleep) is skipped, not sent', async () => {
      const trip = await makeTrip({ departsInMin: 15 }) // it was due 15 minutes ago
      const p = await makeSubscriber('Nardos')
      const booking = await makeBooking(p.user.id, trip.id, [0], { createdAt: new Date(Date.now() - 3 * HOUR) })
      await runDepartSoon()
      expect(sent).toHaveLength(0)
      expect(await statusOf(booking.id)).toEqual({ DEPART_SOON: 'SKIPPED' })
    })

    it('Amharic phones get the 24-hour clock', async () => {
      const trip = await makeTrip({ departsInMin: 25 })
      const p = await makeSubscriber('Oumer', 'am')
      await makeBooking(p.user.id, trip.id, [0], { createdAt: new Date(Date.now() - 3 * HOUR) })
      await runDepartSoon()
      expect(sent[0].body).toContain('Stop 0')
      expect(sent[0].body).toMatch(/\d{2}:\d{2}/)
    })
  })

  describe('registering a phone (routes)', () => {
    const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' }
    const body = (endpoint: string, lang?: string) => ({ endpoint, keys, ...(lang ? { lang } : {}) })

    it('needs a login, and refuses anything that is not a real push address', async () => {
      const u = await makeUser('Pia')
      expect((await api('POST', '/api/v1/push/subscribe', undefined, body('https://push.example.test/x'))).status).toBe(401)
      expect((await api('POST', '/api/v1/push/subscribe', u.tok, body('http://push.example.test/x'))).status).toBe(400)
      expect((await api('POST', '/api/v1/push/subscribe', u.tok, { endpoint: 'https://push.example.test/x', keys: { p256dh: 'a', auth: 'b' } })).status).toBe(400)
      expect((await api('POST', '/api/v1/push/subscribe', u.tok, body('https://push.example.test/x', 'fr'))).status).toBe(400)
    })

    it('registers once per browser, and a browser handed to another account belongs to that account', async () => {
      const a = await makeUser('Qadir')
      const b = await makeUser('Rahel')
      const endpoint = `https://push.example.test/${tag}/shared-${uniq()}`
      expect((await api('POST', '/api/v1/push/subscribe', a.tok, body(endpoint, 'am'))).status).toBe(200)
      expect((await api('POST', '/api/v1/push/subscribe', a.tok, body(endpoint, 'am'))).status).toBe(200)
      expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(1)
      expect((await api('POST', '/api/v1/push/subscribe', b.tok, body(endpoint))).status).toBe(200)
      const row = await prisma.pushSubscription.findUnique({ where: { endpoint } })
      expect(row!.userId).toBe(b.user.id)
    })

    it('you can only remove your own', async () => {
      const a = await makeUser('Samuel')
      const b = await makeUser('Tigist')
      const endpoint = `https://push.example.test/${tag}/own-${uniq()}`
      await api('POST', '/api/v1/push/subscribe', a.tok, body(endpoint))
      await api('DELETE', '/api/v1/push/subscribe', b.tok, { endpoint })
      expect(await prisma.pushSubscription.findUnique({ where: { endpoint } })).not.toBeNull()
      await api('DELETE', '/api/v1/push/subscribe', a.tok, { endpoint })
      expect(await prisma.pushSubscription.findUnique({ where: { endpoint } })).toBeNull()
    })

    it('keeps at most 5 phones per account (the newest)', async () => {
      const a = await makeUser('Ulla')
      const endpoints = Array.from({ length: 7 }, () => `https://push.example.test/${tag}/cap-${uniq()}`)
      for (const e of endpoints) {
        await api('POST', '/api/v1/push/subscribe', a.tok, body(e))
        await new Promise((r) => setTimeout(r, 5))
      }
      const left = (await prisma.pushSubscription.findMany({ where: { userId: a.user.id } })).map((s) => s.endpoint)
      expect(left).toHaveLength(5)
      expect(left).toContain(endpoints[6])
      expect(left).not.toContain(endpoints[0])
    })

    it('the public key is offered only when alerts are set up', async () => {
      const original = process.env.VAPID_PUBLIC_KEY
      process.env.VAPID_PUBLIC_KEY = 'test-public-key'
      expect((await api('GET', '/api/v1/push/public-key')).body.data).toEqual({ enabled: true, publicKey: 'test-public-key' })
      setChannelForTests(null)
      expect((await api('GET', '/api/v1/push/public-key')).body.data).toEqual({ enabled: false, publicKey: null })
      if (original === undefined) delete process.env.VAPID_PUBLIC_KEY
      else process.env.VAPID_PUBLIC_KEY = original
    })
  })

  describe('the outside clock (POST /internal/alerts/tick)', () => {
    it('does not exist without a secret, refuses a wrong one, and works with the right one', async () => {
      delete process.env.ALERTS_CRON_SECRET
      expect((await api('POST', '/api/v1/internal/alerts/tick')).status).toBe(404)
      process.env.ALERTS_CRON_SECRET = 'a-long-test-secret'
      expect((await api('POST', '/api/v1/internal/alerts/tick')).status).toBe(401)
      expect((await api('POST', '/api/v1/internal/alerts/tick', undefined, undefined, { 'x-cron-secret': 'wrong' })).status).toBe(401)

      const trip = await makeTrip({ departsInMin: 25 })
      const p = await makeSubscriber('Vera')
      await makeBooking(p.user.id, trip.id, [0], { createdAt: new Date(Date.now() - 3 * HOUR) })
      const ok = await api('POST', '/api/v1/internal/alerts/tick', undefined, undefined, { 'x-cron-secret': 'a-long-test-secret' })
      expect(ok.status).toBe(200)
      expect(ok.body.data.sent).toBeGreaterThanOrEqual(1)
      expect(bodiesTo(p.endpoint)).toHaveLength(1)
      delete process.env.ALERTS_CRON_SECRET
    })
  })
})
