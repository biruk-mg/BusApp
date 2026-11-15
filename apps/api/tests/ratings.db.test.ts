/**
 * Database tests for ratings (Patch R1): a passenger rates a trip once it has left; the
 * company sees its own stars, comments and per-bus averages; the public sees only a
 * company's average (from 3 ratings); the admin sees everything and can hide a comment.
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
const DAY = 24 * HOUR

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

async function makeCompany(label: string) {
  const operator = await prisma.operator.create({
    data: { companyName: `${tag} ${label}`, licenseNo: `${tag}-L${licenseCounter++}`, phone: '0900000000', commissionPercent: 5 },
  })
  created.operators.add(operator.id)
  const manager = await makeUser(`${label} MANAGER`, 'OPERATOR')
  await prisma.operatorStaff.create({ data: { userId: manager.user.id, operatorId: operator.id, role: 'MANAGER' } })
  const bus1 = await prisma.bus.create({ data: { operatorId: operator.id, plateNumber: `${tag}-${label}-1`, totalSeats: 20 } })
  const bus2 = await prisma.bus.create({ data: { operatorId: operator.id, plateNumber: `${tag}-${label}-2`, totalSeats: 20 } })
  return { operator, manager, bus1, bus2 }
}
type Company = Awaited<ReturnType<typeof makeCompany>>

let route: any, A: Company, B: Company

/**
 * A booking made by `userId` on a trip that left `hoursAgo` hours ago (negative = still to come).
 * Unless `boarded: false`, the checker has marked the passenger as boarded (a ticket from before
 * passenger details existed). `passengers: n` records n named passengers on the ticket instead,
 * none of them boarded yet.
 */
async function makeBooking(
  userId: string | null,
  bus: { id: string },
  opts: { hoursAgo?: number; status?: 'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'COMPLETED'; boarded?: boolean; passengers?: number } = {}
) {
  const dep = new Date(Date.now() - (opts.hoursAgo ?? 5) * HOUR)
  const trip = await prisma.schedule.create({
    data: { routeId: route.id, busId: bus.id, departureTime: dep, arrivalTime: new Date(dep.getTime() + 2 * HOUR), price: 100 },
  })
  const people = opts.passengers ?? 0
  const seats = Array.from({ length: Math.max(people, 1) }, (_, i) => String(i + 1))
  const boardedAt = opts.boarded === false || people > 0 || dep.getTime() > Date.now() ? null : new Date(dep.getTime() + 5 * 60 * 1000)
  return prisma.booking.create({
    data: {
      userId,
      scheduleId: trip.id,
      seatNumbers: seats,
      totalPrice: 100 * seats.length,
      status: opts.status ?? 'CONFIRMED',
      qrCode: `${tag}-qr-${qrCounter++}`,
      boardedAt,
      ...(people > 0 ? { passengers: { create: seats.map((seat) => ({ seatNumber: seat, name: `${tag} Passenger ${seat}` })) } } : {}),
    },
  })
}
const rate = (bookingId: string, tok: string | undefined, body: unknown) => api('PUT', `/api/v1/bookings/${bookingId}/rating`, tok, body)

describe.skipIf(!TEST_URL)('ratings (database, real routes)', () => {
  let alem: { user: any; tok: string }, bekele: { user: any; tok: string }, admin: { user: any; tok: string }

  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    const app = express()
    app.use(express.json())
    app.use('/api/v1/bookings', (await import('../src/routes/booking.routes')).default)
    app.use('/api/v1/operator', (await import('../src/routes/operator.routes')).default)
    app.use('/api/v1/checkin', (await import('../src/routes/checkin.routes')).default)
    app.use('/api/v1/admin', (await import('../src/routes/admin.routes')).default)
    app.use('/api/v1/schedules', (await import('../src/routes/schedule.routes')).default)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    alem = await makeUser('Alem Tesfaye', 'CUSTOMER')
    bekele = await makeUser('Bekele Girma', 'CUSTOMER')
    admin = await makeUser('Admin', 'ADMIN')
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
      await prisma.booking.deleteMany({ where: { scheduleId: { in: tripIds } } }) // ratings go with their booking
      await prisma.schedule.deleteMany({ where: { id: { in: tripIds } } })
      await prisma.bus.deleteMany({ where: { id: { in: buses.map((b) => b.id) } } })
      await prisma.route.deleteMany({ where: { id: { in: created.routes } } })
      await prisma.operatorStaff.deleteMany({ where: { operatorId: { in: ops } } })
      await prisma.operator.deleteMany({ where: { id: { in: ops } } })
      await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } })
      await prisma.$disconnect()
    }
  })

  describe('boarding: only someone the checker marked as boarded can rate', () => {
    const board = (id: string, tok = A.manager.tok) => api('POST', `/api/v1/checkin/bookings/${id}/board`, tok)
    const unboard = (id: string, tok = A.manager.tok) => api('POST', `/api/v1/checkin/bookings/${id}/unboard`, tok)
    const view = async (bookingId: string, tok: string) => (await api('GET', `/api/v1/bookings/${bookingId}`, tok)).body.data.booking

    it('a paid trip that has left but nobody boarded cannot be rated, and nothing is stored', async () => {
      const b = await makeBooking(alem.user.id, A.bus1, { boarded: false })
      expect(await view(b.id, alem.tok)).toMatchObject({ canRate: false, canEditRating: false, rating: null })
      const out = await rate(b.id, alem.tok, { stars: 1, comment: 'I never even went' })
      expect(out.status).toBe(400)
      expect(out.body.error).toMatch(/boarded/i)
      expect(await prisma.rating.count({ where: { bookingId: b.id } })).toBe(0)
    })

    it('opens when the checker marks the ticket as boarded (a ticket with no passenger rows)', async () => {
      const b = await makeBooking(alem.user.id, A.bus1, { boarded: false })
      const ticked = await board(b.id)
      expect(ticked.status, JSON.stringify(ticked.body)).toBe(200)
      expect(await view(b.id, alem.tok)).toMatchObject({ canRate: true })
      const out = await rate(b.id, alem.tok, { stars: 4 })
      expect(out.status, JSON.stringify(out.body)).toBe(201)
    })

    it('with passenger details, one boarded passenger on the ticket is enough', async () => {
      const b = await makeBooking(alem.user.id, A.bus1, { passengers: 2 })
      const people = await prisma.bookingPassenger.findMany({ where: { bookingId: b.id }, orderBy: { seatNumber: 'asc' } })
      expect(people).toHaveLength(2)
      expect((await view(b.id, alem.tok)).canRate).toBe(false)
      expect((await rate(b.id, alem.tok, { stars: 5 })).status).toBe(400)

      expect((await board(people[0].id)).status).toBe(200)
      // The ticket itself is still not marked: the boarding is on the passenger
      expect((await prisma.booking.findUnique({ where: { id: b.id } }))!.boardedAt).toBeNull()
      expect((await view(b.id, alem.tok)).canRate).toBe(true)
      expect((await rate(b.id, alem.tok, { stars: 5 })).status).toBe(201)
    })

    it('undoing the boarding before rating closes it again', async () => {
      const b = await makeBooking(alem.user.id, A.bus1, { passengers: 1 })
      const [p] = await prisma.bookingPassenger.findMany({ where: { bookingId: b.id } })
      await board(p.id)
      expect((await view(b.id, alem.tok)).canRate).toBe(true)
      expect((await unboard(p.id)).status).toBe(200)
      expect((await view(b.id, alem.tok)).canRate).toBe(false)
      expect((await rate(b.id, alem.tok, { stars: 3 })).status).toBe(400)
    })

    it('a rating already given can still be changed if the boarding is undone later', async () => {
      const b = await makeBooking(alem.user.id, A.bus1, { passengers: 1 })
      const [p] = await prisma.bookingPassenger.findMany({ where: { bookingId: b.id } })
      await board(p.id)
      expect((await rate(b.id, alem.tok, { stars: 2 })).status).toBe(201)
      await unboard(p.id)
      expect(await view(b.id, alem.tok)).toMatchObject({ canRate: false, canEditRating: true })
      const changed = await rate(b.id, alem.tok, { stars: 4 })
      expect(changed.status).toBe(200)
      expect(changed.body.data.rating.stars).toBe(4)
    })

    it("another company's checker cannot open rating for a trip it does not run", async () => {
      const b = await makeBooking(alem.user.id, A.bus1, { boarded: false })
      expect((await board(b.id, B.manager.tok)).status).toBe(404)
      expect((await view(b.id, alem.tok)).canRate).toBe(false)
    })
  })

  describe('who can rate, and when', () => {
    it('a passenger rates a paid trip that has left, with stars and a comment', async () => {
      const b = await makeBooking(alem.user.id, A.bus1)
      const out = await rate(b.id, alem.tok, { stars: 5, comment: '  Clean bus, on time  ' })
      expect(out.status, JSON.stringify(out.body)).toBe(201)
      expect(out.body.data.rating).toMatchObject({ stars: 5, comment: 'Clean bus, on time', commentHidden: false })
      // The rating is filed under the company and the bus of the trip, not chosen by the passenger
      const row = await prisma.rating.findUnique({ where: { bookingId: b.id } })
      expect(row).toMatchObject({ operatorId: A.operator.id, busId: A.bus1.id, userId: alem.user.id })
    })

    it('stars only are fine, and an empty comment is stored as no comment', async () => {
      const b = await makeBooking(alem.user.id, A.bus1)
      const out = await rate(b.id, alem.tok, { stars: 3, comment: '   ' })
      expect(out.status).toBe(201)
      expect(out.body.data.rating.comment).toBeNull()
    })

    it.each([[0], [6], [2.5], ['5'], [null]])('rejects stars = %s', async (stars) => {
      const b = await makeBooking(alem.user.id, A.bus1)
      const out = await rate(b.id, alem.tok, { stars })
      expect(out.status).toBe(400)
      expect(await prisma.rating.count({ where: { bookingId: b.id } })).toBe(0)
    })

    it('rejects a comment over 500 letters', async () => {
      const b = await makeBooking(alem.user.id, A.bus1)
      expect((await rate(b.id, alem.tok, { stars: 4, comment: 'x'.repeat(501) })).status).toBe(400)
      expect((await rate(b.id, alem.tok, { stars: 4, comment: 'x'.repeat(500) })).status).toBe(201)
    })

    it('needs a login', async () => {
      const b = await makeBooking(alem.user.id, A.bus1)
      expect((await rate(b.id, undefined, { stars: 5 })).status).toBe(401)
    })

    it("someone else's booking looks like it does not exist", async () => {
      const b = await makeBooking(alem.user.id, A.bus1)
      expect((await rate(b.id, bekele.tok, { stars: 1 })).status).toBe(404)
      // ...even for the admin and for the company's own manager: only the passenger rates
      expect((await rate(b.id, admin.tok, { stars: 1 })).status).toBe(404)
      expect((await rate(b.id, A.manager.tok, { stars: 5 })).status).toBe(404)
      expect(await prisma.rating.count({ where: { bookingId: b.id } })).toBe(0)
    })

    it('a trip that has not left yet cannot be rated', async () => {
      const b = await makeBooking(alem.user.id, A.bus1, { hoursAgo: -3 })
      const out = await rate(b.id, alem.tok, { stars: 5 })
      expect(out.status).toBe(400)
      expect(out.body.error).toMatch(/after it has left/)
    })

    it.each(['PENDING', 'CANCELLED'] as const)('a %s booking cannot be rated', async (status) => {
      const b = await makeBooking(alem.user.id, A.bus1, { status })
      expect((await rate(b.id, alem.tok, { stars: 5 })).status).toBe(400)
      expect(await prisma.rating.count({ where: { bookingId: b.id } })).toBe(0)
    })

    it('a COMPLETED booking can be rated', async () => {
      const b = await makeBooking(alem.user.id, A.bus1, { status: 'COMPLETED' })
      expect((await rate(b.id, alem.tok, { stars: 4 })).status).toBe(201)
    })

    it('a counter sale (no account) cannot be rated by anyone', async () => {
      const b = await makeBooking(null, A.bus1)
      expect((await rate(b.id, alem.tok, { stars: 5 })).status).toBe(404)
    })

    it('can be rated for 30 days after the trip left, not longer', async () => {
      const late = await makeBooking(alem.user.id, A.bus1, { hoursAgo: 31 * 24 })
      const out = await rate(late.id, alem.tok, { stars: 5 })
      expect(out.status).toBe(400)
      expect(out.body.error).toMatch(/30 days/)
      const ok = await makeBooking(alem.user.id, A.bus1, { hoursAgo: 29 * 24 })
      expect((await rate(ok.id, alem.tok, { stars: 5 })).status).toBe(201)
    })

    it('an unknown booking is a 404', async () => {
      expect((await rate('does-not-exist', alem.tok, { stars: 5 })).status).toBe(404)
    })
  })

  describe('changing a rating', () => {
    it('the passenger can change it, and there is still only one rating', async () => {
      const b = await makeBooking(alem.user.id, A.bus1)
      expect((await rate(b.id, alem.tok, { stars: 2, comment: 'Late' })).status).toBe(201)
      const again = await rate(b.id, alem.tok, { stars: 4, comment: 'Late, but the driver was kind' })
      expect(again.status).toBe(200)
      expect(again.body.data.rating).toMatchObject({ stars: 4, comment: 'Late, but the driver was kind' })
      expect(await prisma.rating.count({ where: { bookingId: b.id } })).toBe(1)
    })

    it('can be changed for 7 days after it was given, not longer', async () => {
      const b = await makeBooking(alem.user.id, A.bus1)
      await rate(b.id, alem.tok, { stars: 2 })
      await prisma.rating.update({ where: { bookingId: b.id }, data: { createdAt: new Date(Date.now() - 6 * DAY) } })
      expect((await rate(b.id, alem.tok, { stars: 3 })).status).toBe(200)
      await prisma.rating.update({ where: { bookingId: b.id }, data: { createdAt: new Date(Date.now() - 8 * DAY) } })
      const late = await rate(b.id, alem.tok, { stars: 5 })
      expect(late.status).toBe(400)
      expect(late.body.error).toMatch(/7 days/)
      expect((await prisma.rating.findUnique({ where: { bookingId: b.id } }))!.stars).toBe(3)
    })

    it('two taps at once make one rating, never two or a crash', async () => {
      const b = await makeBooking(alem.user.id, A.bus1)
      const [x, y] = await Promise.all([rate(b.id, alem.tok, { stars: 5 }), rate(b.id, alem.tok, { stars: 4 })])
      expect([x.status, y.status].every((s) => [200, 201, 409].includes(s))).toBe(true)
      expect(await prisma.rating.count({ where: { bookingId: b.id } })).toBe(1)
    })
  })

  describe('My Bookings shows the rating and whether you can rate', () => {
    it('canRate, then the rating itself', async () => {
      const carol = await makeUser('Carol', 'CUSTOMER')
      const gone = await makeBooking(carol.user.id, A.bus1)
      const coming = await makeBooking(carol.user.id, A.bus1, { hoursAgo: -4 })
      const cancelled = await makeBooking(carol.user.id, A.bus1, { status: 'CANCELLED' })
      const find = (list: any[], id: string) => list.find((b) => b.id === id)

      let mine = (await api('GET', '/api/v1/bookings/my', carol.tok)).body.data.bookings
      expect(find(mine, gone.id)).toMatchObject({ canRate: true, canEditRating: false, rating: null })
      expect(find(mine, coming.id)).toMatchObject({ canRate: false })
      expect(find(mine, cancelled.id)).toMatchObject({ canRate: false })

      await rate(gone.id, carol.tok, { stars: 4, comment: 'Good' })
      mine = (await api('GET', '/api/v1/bookings/my', carol.tok)).body.data.bookings
      expect(find(mine, gone.id)).toMatchObject({ canRate: false, canEditRating: true, rating: { stars: 4, comment: 'Good' } })

      const one = (await api('GET', `/api/v1/bookings/${gone.id}`, carol.tok)).body.data.booking
      expect(one).toMatchObject({ canRate: false, canEditRating: true, rating: { stars: 4 } })
      // The admin looking at it cannot rate it for her
      const asAdmin = (await api('GET', `/api/v1/bookings/${gone.id}`, admin.tok)).body.data.booking
      expect(asAdmin).toMatchObject({ canRate: false, canEditRating: false })
    })
  })

  describe('the public sees only a company average, from 3 ratings', () => {
    it('hidden below 3, shown from 3, never a comment, and companies do not mix', async () => {
      const searchFor = async (c: Company) => {
        const dep = new Date(Date.now() + 2 * DAY)
        const trip = await prisma.schedule.create({
          data: { routeId: route.id, busId: c.bus1.id, departureTime: dep, arrivalTime: new Date(dep.getTime() + 2 * HOUR), price: 100 },
        })
        const out = await api('GET', `/api/v1/schedules/search?fromCity=${encodeURIComponent(route.fromCity)}&toCity=${encodeURIComponent(route.toCity)}&operatorId=${c.operator.id}`)
        expect(out.status).toBe(200)
        const found = out.body.data.schedules.find((s: any) => s.id === trip.id)
        expect(found).toBeTruthy()
        return found.bus.operator
      }
      const give = async (c: Company, bus: { id: string }, who: { user: any; tok: string }, stars: number, comment?: string) => {
        const b = await makeBooking(who.user.id, bus)
        expect((await rate(b.id, who.tok, { stars, comment })).status).toBe(201)
      }

      expect((await searchFor(B)).rating).toBeNull() // no ratings
      await give(B, B.bus1, alem, 5, 'Secret comment one')
      await give(B, B.bus2, bekele, 4)
      expect((await searchFor(B)).rating).toBeNull() // 2 ratings: not public yet
      await give(B, B.bus1, alem, 4)
      const shown = await searchFor(B)
      expect(shown.rating).toEqual({ average: 4.3, count: 3 }) // (5+4+4)/3
      expect(JSON.stringify(shown)).not.toMatch(/Secret comment/)
      // The other company is unaffected
      const other = await searchFor(A)
      const aRows = await prisma.rating.findMany({ where: { operatorId: A.operator.id }, select: { stars: true } })
      expect(aRows.length).toBeGreaterThanOrEqual(3) // earlier tests gave company A plenty of ratings
      const aAverage = Math.round((aRows.reduce((n, r) => n + r.stars, 0) / aRows.length) * 10) / 10
      expect(other.id).toBe(A.operator.id)
      expect(other.rating).toEqual({ average: aAverage, count: aRows.length })

      // The seat page and the trip list carry it too
      const trip = await prisma.schedule.findFirst({ where: { busId: B.bus1.id, departureTime: { gt: new Date() } } })
      const detail = await api('GET', `/api/v1/schedules/${trip!.id}`)
      expect(detail.body.data.schedule.bus.operator.rating).toEqual({ average: 4.3, count: 3 })
      const all = await api('GET', '/api/v1/schedules')
      expect(all.body.data.schedules.find((s: any) => s.id === trip!.id).bus.operator.rating).toEqual({ average: 4.3, count: 3 })
    })
  })

  describe('the company sees its own ratings', () => {
    let C: Company
    beforeAll(async () => {
      C = await makeCompany('C')
      const dave = await makeUser('Dawit Haile', 'CUSTOMER')
      for (const [bus, stars, comment] of [
        [C.bus1, 5, 'Great ride'],
        [C.bus1, 3, undefined],
        [C.bus2, 1, 'Rude conductor'],
        [C.bus1, 5, undefined],
      ] as const) {
        const b = await makeBooking(dave.user.id, bus)
        await rate(b.id, dave.tok, { stars, comment })
      }
    })

    it('average, count, spread, each bus, and recent comments with a first name only', async () => {
      const out = await api('GET', '/api/v1/operator/ratings', C.manager.tok)
      expect(out.status, JSON.stringify(out.body)).toBe(200)
      const d = out.body.data
      expect(d).toMatchObject({ average: 3.5, count: 4, publiclyShown: true, publicFrom: 3 })
      expect(d.distribution).toEqual({ '1': 1, '2': 0, '3': 1, '4': 0, '5': 2 })
      const bus1 = d.buses.find((b: any) => b.busId === C.bus1.id)
      const bus2 = d.buses.find((b: any) => b.busId === C.bus2.id)
      expect(bus1).toMatchObject({ plateNumber: C.bus1.plateNumber, count: 3, average: 4.3 })
      expect(bus2).toMatchObject({ plateNumber: C.bus2.plateNumber, count: 1, average: 1 })
      expect(d.recent).toHaveLength(4)
      expect(d.recent.find((r: any) => r.comment === 'Rude conductor')).toMatchObject({ stars: 1, plateNumber: C.bus2.plateNumber })
      // First name only: the company never gets the passenger's full name
      expect(d.recent.every((r: any) => r.passenger === `${tag}`)).toBe(true)
      expect(JSON.stringify(d)).not.toMatch(/Dawit Haile/)
    })

    it('a company sees only its own ratings', async () => {
      const outA = await api('GET', '/api/v1/operator/ratings', A.manager.tok)
      expect(outA.body.data.recent.every((r: any) => r.plateNumber.startsWith(`${tag}-A-`))).toBe(true)
      expect(JSON.stringify(outA.body)).not.toMatch(new RegExp(`${tag}-C-`))
    })

    it('passengers and logged-out visitors cannot open it', async () => {
      expect((await api('GET', '/api/v1/operator/ratings', alem.tok)).status).toBe(403)
      expect((await api('GET', '/api/v1/operator/ratings')).status).toBe(401)
    })
  })

  describe('the admin: all ratings, and hiding an abusive comment', () => {
    it('lists everything with the full name, and only the admin can', async () => {
      const out = await api('GET', '/api/v1/admin/ratings?limit=200', admin.tok)
      expect(out.status).toBe(200)
      expect(out.body.data.ratings.length).toBeGreaterThan(0)
      expect(out.body.data.ratings[0]).toHaveProperty('passenger')
      expect(out.body.data.companies.length).toBeGreaterThan(0)
      expect((await api('GET', '/api/v1/admin/ratings', alem.tok)).status).toBe(403)
      expect((await api('GET', '/api/v1/admin/ratings', A.manager.tok)).status).toBe(403)
      expect((await api('GET', '/api/v1/admin/ratings')).status).toBe(401)
    })

    it('a hidden comment disappears for the company, the stars still count, the passenger can only change stars', async () => {
      const D = await makeCompany('D')
      const eve = await makeUser('Eyerus', 'CUSTOMER')
      const b = await makeBooking(eve.user.id, D.bus1)
      await rate(b.id, eve.tok, { stars: 1, comment: 'Abusive words' })
      const row = await prisma.rating.findUnique({ where: { bookingId: b.id } })

      // A manager cannot hide it; the admin must give a reason
      expect((await api('POST', `/api/v1/admin/ratings/${row!.id}/hide`, D.manager.tok, { reason: 'abuse' })).status).toBe(403)
      expect((await api('POST', `/api/v1/admin/ratings/${row!.id}/hide`, admin.tok, {})).status).toBe(400)
      expect((await api('POST', `/api/v1/admin/ratings/${row!.id}/hide`, admin.tok, { reason: 'Insults' })).status).toBe(200)

      const mine = (await api('GET', '/api/v1/operator/ratings', D.manager.tok)).body.data
      expect(mine.count).toBe(1)
      expect(mine.average).toBe(1) // the stars still count
      expect(mine.recent[0]).toMatchObject({ stars: 1, comment: null, commentHidden: true })
      expect(JSON.stringify(mine)).not.toMatch(/Abusive words/)

      // The admin still sees it, with the reason
      const adminView = (await api('GET', `/api/v1/admin/ratings?operatorId=${D.operator.id}`, admin.tok)).body.data.ratings[0]
      expect(adminView).toMatchObject({ comment: 'Abusive words', commentHidden: true, commentHiddenReason: 'Insults' })
      expect((await api('GET', '/api/v1/admin/ratings?hidden=true&limit=200', admin.tok)).body.data.ratings.some((r: any) => r.id === row!.id)).toBe(true)

      // The passenger can change the stars, but cannot swap in a new comment
      expect((await rate(b.id, eve.tok, { stars: 2, comment: 'Abusive words' })).status).toBe(200)
      const swap = await rate(b.id, eve.tok, { stars: 2, comment: 'Different words' })
      expect(swap.status).toBe(400)
      expect(swap.body.error).toMatch(/hidden/)
      const mineBooking = (await api('GET', `/api/v1/bookings/${b.id}`, eve.tok)).body.data.booking
      expect(mineBooking.rating).toMatchObject({ commentHidden: true })

      // Unhide brings it back
      expect((await api('POST', `/api/v1/admin/ratings/${row!.id}/unhide`, admin.tok)).status).toBe(200)
      const back = (await api('GET', '/api/v1/operator/ratings', D.manager.tok)).body.data
      expect(back.recent[0]).toMatchObject({ comment: 'Abusive words', commentHidden: false })
    })

    it('hiding needs a comment and an existing rating', async () => {
      const b = await makeBooking(alem.user.id, A.bus1)
      await rate(b.id, alem.tok, { stars: 5 })
      const row = await prisma.rating.findUnique({ where: { bookingId: b.id } })
      expect((await api('POST', `/api/v1/admin/ratings/${row!.id}/hide`, admin.tok, { reason: 'nothing here' })).status).toBe(400)
      expect((await api('POST', '/api/v1/admin/ratings/nope/hide', admin.tok, { reason: 'abuse' })).status).toBe(404)
      expect((await api('POST', '/api/v1/admin/ratings/nope/unhide', admin.tok)).status).toBe(404)
    })
  })
})
