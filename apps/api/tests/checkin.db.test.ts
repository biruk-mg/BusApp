/**
 * Database tests for the ticket checker / boarding list (Patch D), through the REAL
 * routes over HTTP: route -> permission check -> controller -> database.
 *
 * Only run when TEST_DATABASE_URL is set; refuse to run against DATABASE_URL.
 * They create their own rows (marked TEST-) and remove them afterwards.
 *
 *   TEST_DATABASE_URL="postgresql://..." pnpm test
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import dotenv from 'dotenv'
import http from 'http'
import type { AddressInfo } from 'net'
import express from 'express'
import jwt from 'jsonwebtoken'

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
const created = {
  users: new Set<string>(), operators: [] as string[], buses: [] as string[],
  routes: [] as string[], points: [] as string[],
}
let phoneCounter = 0
const newPhone = () => `09${String((Date.now() % 1000000) * 100 + phoneCounter++).padStart(8, '0').slice(-8)}`
let qrCounter = 0

const token = (userId: string, role: string) => jwt.sign({ userId, role }, process.env.JWT_SECRET!)

async function api(method: string, path: string, tok?: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, body: json as any }
}

interface Staff { user: any; staff: any; tok: string }
async function makeStaff(label: string, operatorId: string, role: 'MANAGER' | 'SELLER' | 'CHECKER'): Promise<Staff> {
  const user = await prisma.user.create({ data: { name: `${tag} ${label}`, phone: newPhone(), password: 'x', role: 'OPERATOR' } })
  created.users.add(user.id)
  const staff = await prisma.operatorStaff.create({ data: { userId: user.id, operatorId, role } })
  return { user, staff, tok: token(user.id, 'OPERATOR') }
}
async function makeUser(label: string, role: 'CUSTOMER' | 'ADMIN') {
  const user = await prisma.user.create({ data: { name: `${tag} ${label}`, phone: newPhone(), password: 'x', role } })
  created.users.add(user.id)
  return { user, tok: token(user.id, role) }
}

let opA: any, opB: any
let managerA: Staff, sellerA: Staff, checkerA: Staff, checkerA2: Staff, checkerB: Staff
let customer: { user: any; tok: string }, admin: { tok: string }
let busA: any, busB: any, route: any, p1: any, p2: any

let tripCounter = 0
/** A new trip with its own empty passenger list. */
async function newTrip(bus: any, opts: { hoursAhead?: number; status?: 'OPEN' | 'CLOSED' } = {}) {
  const dep = new Date(Date.now() + (opts.hoursAhead ?? 48) * 3600 * 1000 + tripCounter++ * 60000)
  return prisma.schedule.create({
    data: {
      routeId: route.id, busId: bus.id, departureTime: dep,
      arrivalTime: new Date(dep.getTime() + 7200000), price: 100, status: opts.status ?? 'OPEN',
    },
  })
}

/** A booking made straight in the database (the sale and payment flows have their own tests). */
async function makeBooking(tripId: string, over: Record<string, unknown> = {}) {
  const { generateTicketCode } = await import('../src/lib/ticketCode')
  return prisma.booking.create({
    data: {
      scheduleId: tripId, seatNumbers: ['01'], totalPrice: 100, status: 'CONFIRMED',
      qrCode: `${tag}-qr-${qrCounter++}`, source: 'COUNTER', passengerName: 'Abebe Kebede',
      passengerPhone: newPhone(), ticketCode: generateTicketCode(), ...over,
    },
  })
}

const list = (tok: string | undefined, tripId: string) => api('GET', `/api/v1/checkin/trips/${tripId}/passengers`, tok)
const board = (tok: string | undefined, id: string) => api('POST', `/api/v1/checkin/bookings/${id}/board`, tok)
const unboard = (tok: string | undefined, id: string) => api('POST', `/api/v1/checkin/bookings/${id}/unboard`, tok)

describe.skipIf(!TEST_URL)('ticket checker boarding (database, real routes)', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    const app = express()
    app.use(express.json())
    app.use('/api/v1/counter', (await import('../src/routes/counter.routes')).default)
    app.use('/api/v1/checkin', (await import('../src/routes/checkin.routes')).default)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    opA = await prisma.operator.create({ data: { companyName: `${tag} A`, licenseNo: `${tag}-A`, phone: '0900000011' } })
    opB = await prisma.operator.create({ data: { companyName: `${tag} B`, licenseNo: `${tag}-B`, phone: '0900000012' } })
    created.operators.push(opA.id, opB.id)

    managerA = await makeStaff('manager A', opA.id, 'MANAGER')
    sellerA = await makeStaff('seller A', opA.id, 'SELLER')
    checkerA = await makeStaff('checker A', opA.id, 'CHECKER')
    checkerA2 = await makeStaff('checker A2', opA.id, 'CHECKER')
    checkerB = await makeStaff('checker B', opB.id, 'CHECKER')
    customer = await makeUser('passenger', 'CUSTOMER')
    admin = await makeUser('admin', 'ADMIN')

    route = await prisma.route.create({ data: { fromCity: `${tag}-From`, toCity: `${tag}-To`, distanceKm: 100, estimatedDurationMin: 120 } })
    created.routes.push(route.id)
    busA = await prisma.bus.create({ data: { operatorId: opA.id, plateNumber: `${tag}-A1`, totalSeats: 10 } })
    busB = await prisma.bus.create({ data: { operatorId: opB.id, plateNumber: `${tag}-B1`, totalSeats: 10 } })
    created.buses.push(busA.id, busB.id)
    p1 = await prisma.pickupPoint.create({ data: { operatorId: opA.id, routeId: route.id, name: `${tag} Meskel`, sequence: 1, offsetMin: 15 } })
    p2 = await prisma.pickupPoint.create({ data: { operatorId: opA.id, routeId: route.id, name: `${tag} Bole`, sequence: 2, offsetMin: 30 } })
    created.points.push(p1.id, p2.id)
  })

  afterAll(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
    if (prisma) {
      const trips = await prisma.schedule.findMany({ where: { busId: { in: created.buses } }, select: { id: true } })
      const tripIds = trips.map((t) => t.id)
      await prisma.payment.deleteMany({ where: { booking: { scheduleId: { in: tripIds } } } })
      await prisma.booking.deleteMany({ where: { scheduleId: { in: tripIds } } })
      await prisma.schedule.deleteMany({ where: { id: { in: tripIds } } })
      await prisma.pickupPoint.deleteMany({ where: { id: { in: created.points } } })
      await prisma.bus.deleteMany({ where: { id: { in: created.buses } } })
      await prisma.route.deleteMany({ where: { id: { in: created.routes } } })
      await prisma.operator.deleteMany({ where: { id: { in: created.operators } } }) // staff rows cascade
      await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } })
      await prisma.$disconnect()
    }
  })

  // ─── Who may use it ─────────────────────────────────────
  it('lets checkers and managers in, and keeps everyone else out', async () => {
    const trip = await newTrip(busA)
    const b = await makeBooking(trip.id)
    for (const tok of [checkerA.tok, managerA.tok]) {
      expect((await list(tok, trip.id)).status).toBe(200)
    }
    // sellers sell, they don't check; passengers and the admin have no company
    for (const tok of [sellerA.tok, customer.tok, admin.tok]) {
      expect((await list(tok, trip.id)).status).toBe(403)
      expect((await board(tok, b.id)).status).toBe(403)
      expect((await api('GET', '/api/v1/checkin/trips', tok)).status).toBe(403)
    }
    expect((await list(undefined, trip.id)).status).toBe(401)
    expect((await board(undefined, b.id)).status).toBe(401)
    expect((await prisma.booking.findUnique({ where: { id: b.id } }))!.boardedAt).toBeNull()
  })

  it('stops a deactivated checker at once', async () => {
    const temp = await makeStaff('temp checker', opA.id, 'CHECKER')
    const trip = await newTrip(busA)
    expect((await list(temp.tok, trip.id)).status).toBe(200)
    await prisma.operatorStaff.update({ where: { id: temp.staff.id }, data: { active: false } })
    expect((await list(temp.tok, trip.id)).status).toBe(403)
  })

  // ─── Trips of the day ───────────────────────────────────
  it("lists only the company's own trips for the day, including closed and departed ones, with counts", async () => {
    const open = await newTrip(busA)
    const closed = await newTrip(busA, { status: 'CLOSED' })
    const otherCompany = await newTrip(busB)
    await makeBooking(open.id, { seatNumbers: ['01', '02'] })
    const boarded = await makeBooking(open.id, { seatNumbers: ['03'] })
    await makeBooking(open.id, { seatNumbers: ['04'], status: 'PENDING' })   // unpaid: not counted
    await makeBooking(open.id, { seatNumbers: ['05'], status: 'CANCELLED' }) // voided: not counted
    expect((await board(checkerA.tok, boarded.id)).status).toBe(200)

    const date = new Date(open.departureTime.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10) // Addis day
    const res = await api('GET', `/api/v1/checkin/trips?date=${date}`, checkerA.tok)
    expect(res.status).toBe(200)
    const ids = res.body.data.trips.map((t: any) => t.id)
    expect(ids).toContain(open.id)
    expect(ids).toContain(closed.id)
    expect(ids).not.toContain(otherCompany.id)
    const row = res.body.data.trips.find((t: any) => t.id === open.id)
    expect(row).toMatchObject({ soldSeats: 3, boardedSeats: 1 })
    expect(row.bus.plateNumber).toBe(busA.plateNumber)

    expect((await api('GET', '/api/v1/checkin/trips?date=2026-02-31', checkerA.tok)).status).toBe(400)
    expect((await api('GET', '/api/v1/checkin/trips?date=hello', checkerA.tok)).status).toBe(400)
  })

  // ─── The passenger list ─────────────────────────────────
  it('shows paid passengers only, with online passengers under their account name', async () => {
    const trip = await newTrip(busA)
    await makeBooking(trip.id, { seatNumbers: ['01'], passengerName: 'Counter Person' })
    await makeBooking(trip.id, {
      seatNumbers: ['02'], source: 'ONLINE', userId: customer.user.id,
      passengerName: null, passengerPhone: null, ticketCode: null,
    })
    await makeBooking(trip.id, { seatNumbers: ['03'], status: 'PENDING', passengerName: 'Unpaid Person' })
    await makeBooking(trip.id, { seatNumbers: ['04'], status: 'CANCELLED', passengerName: 'Voided Person' })

    const res = await list(checkerA.tok, trip.id)
    expect(res.status).toBe(200)
    const names = res.body.data.passengers.map((p: any) => p.name)
    expect(names).toHaveLength(2)
    expect(names).toContain('Counter Person')
    expect(names).toContain(customer.user.name)
    const online = res.body.data.passengers.find((p: any) => p.source === 'ONLINE')
    expect(online.phone).toBe(customer.user.phone)
    expect(res.body.data).toMatchObject({ soldSeats: 2, boardedSeats: 0 })
  })

  it('orders passengers by pickup point, then seat, with no-pickup passengers last', async () => {
    const trip = await newTrip(busA)
    await makeBooking(trip.id, { seatNumbers: ['09'], passengerName: 'No pickup' })
    await makeBooking(trip.id, { seatNumbers: ['03'], passengerName: 'Second stop A', pickupPointId: p2.id })
    await makeBooking(trip.id, { seatNumbers: ['05'], passengerName: 'First stop B', pickupPointId: p1.id })
    await makeBooking(trip.id, { seatNumbers: ['02'], passengerName: 'First stop A', pickupPointId: p1.id })
    const res = await list(checkerA.tok, trip.id)
    expect(res.body.data.passengers.map((p: any) => p.name)).toEqual(['First stop A', 'First stop B', 'Second stop A', 'No pickup'])
    expect(res.body.data.passengers[0].pickupPoint.name).toBe(p1.name)
  })

  it("treats another company's trip like a trip that does not exist", async () => {
    const theirs = await newTrip(busB)
    await makeBooking(theirs.id)
    expect((await list(checkerA.tok, theirs.id)).status).toBe(404)
    expect((await list(checkerA.tok, 'does-not-exist')).status).toBe(404)
    expect((await list(checkerB.tok, theirs.id)).status).toBe(200)
  })

  // ─── Ticking people off ─────────────────────────────────
  it('ticks a passenger as boarded and remembers who and when', async () => {
    const trip = await newTrip(busA)
    const b = await makeBooking(trip.id, { seatNumbers: ['01', '02'] })
    const out = await board(checkerA.tok, b.id)
    expect(out.status).toBe(200)
    expect(out.body.data.passenger).toMatchObject({ id: b.id, boarded: true, boardedBy: checkerA.user.name })
    const row = await prisma.booking.findUnique({ where: { id: b.id } })
    expect(row!.boardedAt).not.toBeNull()
    expect(row!.boardedByStaffId).toBe(checkerA.staff.id)

    const after = await list(checkerA.tok, trip.id)
    expect(after.body.data).toMatchObject({ soldSeats: 2, boardedSeats: 2 })
    expect(after.body.data.passengers[0].boarded).toBe(true)
  })

  it('does nothing when a passenger is ticked twice, and keeps the first tick', async () => {
    const trip = await newTrip(busA)
    const b = await makeBooking(trip.id)
    await board(checkerA.tok, b.id)
    const first = await prisma.booking.findUnique({ where: { id: b.id } })
    const again = await board(checkerA2.tok, b.id)
    expect(again.status).toBe(200)
    const second = await prisma.booking.findUnique({ where: { id: b.id } })
    expect(second!.boardedAt!.getTime()).toBe(first!.boardedAt!.getTime())
    expect(second!.boardedByStaffId).toBe(checkerA.staff.id)
    expect(again.body.data.passenger.boardedBy).toBe(checkerA.user.name)
  })

  it('lets two checkers tick the same passenger at the same moment without trouble', async () => {
    const trip = await newTrip(busA)
    const b = await makeBooking(trip.id)
    const results = await Promise.all([board(checkerA.tok, b.id), board(checkerA2.tok, b.id), board(managerA.tok, b.id)])
    expect(results.map((r) => r.status)).toEqual([200, 200, 200])
    const row = await prisma.booking.findUnique({ where: { id: b.id } })
    expect(row!.boardedAt).not.toBeNull()
    expect([checkerA.staff.id, checkerA2.staff.id, managerA.staff.id]).toContain(row!.boardedByStaffId)
  })

  it('can undo a tick, and undoing twice is harmless', async () => {
    const trip = await newTrip(busA)
    const b = await makeBooking(trip.id)
    await board(checkerA.tok, b.id)
    const out = await unboard(checkerA2.tok, b.id)
    expect(out.status).toBe(200)
    expect(out.body.data.passenger.boarded).toBe(false)
    const row = await prisma.booking.findUnique({ where: { id: b.id } })
    expect(row).toMatchObject({ boardedAt: null, boardedByStaffId: null })
    expect((await unboard(checkerA.tok, b.id)).status).toBe(200)
  })

  it('refuses to tick unpaid, expired or voided tickets', async () => {
    const trip = await newTrip(busA)
    const pending = await makeBooking(trip.id, { seatNumbers: ['01'], status: 'PENDING' })
    const voided = await makeBooking(trip.id, { seatNumbers: ['02'], status: 'CANCELLED', voidedAt: new Date() })
    for (const b of [pending, voided]) {
      const out = await board(checkerA.tok, b.id)
      expect(out.status).toBe(409)
      expect(out.body.error).toMatch(/not valid/i)
      expect((await prisma.booking.findUnique({ where: { id: b.id } }))!.boardedAt).toBeNull()
    }
  })

  it("will not tick or untick another company's passenger", async () => {
    const theirs = await newTrip(busB)
    const b = await makeBooking(theirs.id)
    expect((await board(checkerA.tok, b.id)).status).toBe(404)
    expect((await prisma.booking.findUnique({ where: { id: b.id } }))!.boardedAt).toBeNull()
    await board(checkerB.tok, b.id)
    expect((await unboard(checkerA.tok, b.id)).status).toBe(404)
    expect((await prisma.booking.findUnique({ where: { id: b.id } }))!.boardedAt).not.toBeNull()
    expect((await board(checkerA.tok, 'does-not-exist')).status).toBe(404)
  })

  it('drops a passenger from the list when their counter sale is voided', async () => {
    const trip = await newTrip(busA)
    const sold = await api('POST', '/api/v1/counter/sales', sellerA.tok, {
      scheduleId: trip.id, seatNumbers: ['01'], passengerName: 'Voided Sale', passengerPhone: newPhone(), method: 'CASH',
      pickupPointId: p1.id, // this route has pickup points, so a sale must name one
    })
    expect(sold.status).toBe(201)
    expect((await list(checkerA.tok, trip.id)).body.data.passengers).toHaveLength(1)
    const voidRes = await api('POST', `/api/v1/counter/sales/${sold.body.data.booking.id}/void`, sellerA.tok, { reason: 'wrong seat' })
    expect(voidRes.status).toBe(200)
    expect((await list(checkerA.tok, trip.id)).body.data.passengers).toHaveLength(0)
  })

  // ─── Finding a ticket by its code ───────────────────────
  it('finds a ticket by its code and says whether it can be used', async () => {
    const trip = await newTrip(busA)
    const b = await makeBooking(trip.id, { pickupPointId: p1.id })
    const ok = await api('GET', `/api/v1/checkin/lookup/${b.ticketCode}`, checkerA.tok)
    expect(ok.status).toBe(200)
    expect(ok.body.data.state).toBe('OK')
    expect(ok.body.data.passenger).toMatchObject({ id: b.id, name: 'Abebe Kebede', boarded: false })
    expect(ok.body.data.trip.id).toBe(trip.id)
    expect(ok.body.data.trip.route.fromCity).toBe(route.fromCity)

    // lower case and spaces around the code are fine
    expect((await api('GET', `/api/v1/checkin/lookup/${encodeURIComponent(` ${b.ticketCode!.toLowerCase()} `)}`, checkerA.tok)).status).toBe(200)

    await board(checkerA.tok, b.id)
    expect((await api('GET', `/api/v1/checkin/lookup/${b.ticketCode}`, checkerA.tok)).body.data.state).toBe('ALREADY_BOARDED')

    const voided = await makeBooking(trip.id, { seatNumbers: ['02'], status: 'CANCELLED' })
    expect((await api('GET', `/api/v1/checkin/lookup/${voided.ticketCode}`, checkerA.tok)).body.data.state).toBe('VOIDED')
  })

  it('does not reveal tickets of another company, or accept bad codes', async () => {
    const theirs = await newTrip(busB)
    const b = await makeBooking(theirs.id)
    expect((await api('GET', `/api/v1/checkin/lookup/${b.ticketCode}`, checkerA.tok)).status).toBe(404)
    expect((await api('GET', `/api/v1/checkin/lookup/${b.ticketCode}`, checkerB.tok)).status).toBe(200)
    for (const code of ['SHORT', 'AAAAAAAA0', 'IIIIIIII', 'ZZZZZZZZ']) {
      expect((await api('GET', `/api/v1/checkin/lookup/${code}`, checkerA.tok)).status).toBe(404)
    }
    expect((await api('GET', `/api/v1/checkin/lookup/${b.ticketCode}`, sellerA.tok)).status).toBe(403)
    expect((await api('GET', `/api/v1/checkin/lookup/${b.ticketCode}`)).status).toBe(401)
  })
})
