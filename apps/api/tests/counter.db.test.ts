/**
 * Database tests for counter sales (Patch C2), through the REAL routes over HTTP:
 * route -> permission check -> controller -> database.
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

// Online bookings need a name for every seat
const pax = (seats: string[]) => seats.map((s) => ({ seatNumber: s, name: `Test Passenger ${s}` }))

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
let refCounter = 0
const newRef = (prefix = 'TX') => `${prefix}${Date.now().toString(36).toUpperCase()}${refCounter++}`.slice(0, 30)

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
async function makeUser(label: string, role: 'CUSTOMER' | 'ADMIN', phone = newPhone()) {
  const user = await prisma.user.create({ data: { name: `${tag} ${label}`, phone, password: 'x', role } })
  created.users.add(user.id)
  return { user, tok: token(user.id, role) }
}

let opA: any, opB: any, opC: any
let managerA: Staff, sellerA: Staff, sellerA2: Staff, checkerA: Staff, managerB: Staff, sellerB: Staff
let managerC: Staff, sellerC1: Staff, sellerC2: Staff
let customer: { user: any; tok: string }, admin: { tok: string }
let busA: any, busB: any, busC: any, route: any, routeWithPickups: any, pickupA: any, pickupB: any

/** A new trip (10 seats, ETB 100 a seat) so each test has its own empty seat map. */
let tripCounter = 0
async function newTrip(bus: any, opts: { routeId?: string; hoursAhead?: number; status?: 'OPEN' | 'CLOSED' } = {}) {
  const dep = new Date(Date.now() + (opts.hoursAhead ?? 48) * 3600 * 1000 + tripCounter++ * 60000)
  return prisma.schedule.create({
    data: {
      routeId: opts.routeId ?? route.id, busId: bus.id, departureTime: dep,
      arrivalTime: new Date(dep.getTime() + 7200000), price: 100, status: opts.status ?? 'OPEN',
    },
  })
}

const sale = (tripId: string, over: Record<string, unknown> = {}) => ({
  scheduleId: tripId, seatNumbers: ['01'], passengerName: 'Abebe Kebede', passengerPhone: newPhone(),
  method: 'CASH', ...over,
})
const sell = (tok: string, body: unknown) => api('POST', '/api/v1/counter/sales', tok, body)

describe.skipIf(!TEST_URL)('counter sales (database, real routes)', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    const app = express()
    app.use(express.json())
    app.use('/api/v1/auth', (await import('../src/routes/auth.routes')).default)
    app.use('/api/v1/operator', (await import('../src/routes/operator.routes')).default)
    app.use('/api/v1/schedules', (await import('../src/routes/schedule.routes')).default)
    app.use('/api/v1/bookings', (await import('../src/routes/booking.routes')).default)
    app.use('/api/v1/payments', (await import('../src/routes/payment.routes')).default)
    app.use('/api/v1/counter', (await import('../src/routes/counter.routes')).default)
    app.use('/api/v1/tickets', (await import('../src/routes/ticket.routes')).default)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    opA = await prisma.operator.create({ data: { companyName: `${tag} A`, licenseNo: `${tag}-A`, phone: '0900000001' } })
    opB = await prisma.operator.create({ data: { companyName: `${tag} B`, licenseNo: `${tag}-B`, phone: '0900000002' } })
    opC = await prisma.operator.create({ data: { companyName: `${tag} C`, licenseNo: `${tag}-C`, phone: '0900000003' } })
    created.operators.push(opA.id, opB.id, opC.id)

    managerA = await makeStaff('manager A', opA.id, 'MANAGER')
    sellerA = await makeStaff('seller A', opA.id, 'SELLER')
    sellerA2 = await makeStaff('seller A2', opA.id, 'SELLER')
    checkerA = await makeStaff('checker A', opA.id, 'CHECKER')
    managerB = await makeStaff('manager B', opB.id, 'MANAGER')
    sellerB = await makeStaff('seller B', opB.id, 'SELLER')
    managerC = await makeStaff('manager C', opC.id, 'MANAGER')
    sellerC1 = await makeStaff('seller C1', opC.id, 'SELLER')
    sellerC2 = await makeStaff('seller C2', opC.id, 'SELLER')
    customer = await makeUser('passenger', 'CUSTOMER')
    admin = await makeUser('admin', 'ADMIN')

    route = await prisma.route.create({ data: { fromCity: `${tag}-From`, toCity: `${tag}-To`, distanceKm: 100, estimatedDurationMin: 120 } })
    routeWithPickups = await prisma.route.create({ data: { fromCity: `${tag}-From2`, toCity: `${tag}-To2`, distanceKm: 100, estimatedDurationMin: 120 } })
    created.routes.push(route.id, routeWithPickups.id)
    busA = await prisma.bus.create({ data: { operatorId: opA.id, plateNumber: `${tag}-A1`, totalSeats: 10 } })
    busB = await prisma.bus.create({ data: { operatorId: opB.id, plateNumber: `${tag}-B1`, totalSeats: 10 } })
    busC = await prisma.bus.create({ data: { operatorId: opC.id, plateNumber: `${tag}-C1`, totalSeats: 10 } })
    created.buses.push(busA.id, busB.id, busC.id)
    // Company A has a pickup point on the second route; company B has one too
    pickupA = await prisma.pickupPoint.create({ data: { operatorId: opA.id, routeId: routeWithPickups.id, name: `${tag} Meskel`, offsetMin: 15 } })
    pickupB = await prisma.pickupPoint.create({ data: { operatorId: opB.id, routeId: routeWithPickups.id, name: `${tag} Bole`, offsetMin: 10 } })
    created.points.push(pickupA.id, pickupB.id)
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

  // ─── Selling ────────────────────────────────────────────
  it('lets a seller sell a ticket for cash, with the price worked out by the server', async () => {
    const trip = await newTrip(busA)
    const out = await sell(sellerA.tok, { ...sale(trip.id, { seatNumbers: ['01', '02'] }), totalPrice: 1, price: 1 })
    expect(out.status).toBe(201)
    const b = out.body.data.booking
    expect(b).toMatchObject({ status: 'CONFIRMED', source: 'COUNTER', totalPrice: 200, passengerName: 'Abebe Kebede' })
    expect(b.seatNumbers).toEqual(['01', '02'])
    expect(b.payment).toMatchObject({ method: 'CASH', amount: 200, reference: null })
    expect(b.soldByStaffId).toBe(sellerA.staff.id)
    expect(b.ticketCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)

    // The seats now show as taken to everyone
    const seats = await api('GET', `/api/v1/schedules/${trip.id}/seats`)
    expect(seats.body.data.bookedSeats).toEqual(expect.arrayContaining(['01', '02']))
  })

  it('lets a manager sell too', async () => {
    const trip = await newTrip(busA)
    expect((await sell(managerA.tok, sale(trip.id))).status).toBe(201)
  })

  it('requires a valid passenger name and phone number, and stores the phone in one form', async () => {
    const trip = await newTrip(busA)
    expect((await sell(sellerA.tok, sale(trip.id, { passengerPhone: undefined }))).status).toBe(400)
    expect((await sell(sellerA.tok, sale(trip.id, { passengerPhone: '12345' }))).status).toBe(400)
    expect((await sell(sellerA.tok, sale(trip.id, { passengerName: ' ' }))).status).toBe(400)
    const ok = await sell(sellerA.tok, sale(trip.id, { passengerPhone: '+251911223344' }))
    expect(ok.status).toBe(201)
    expect(ok.body.data.booking.passengerPhone).toBe('0911223344')
  })

  it('needs the receipt number for Telebirr, CBE Birr and bank, but not for cash', async () => {
    const trip = await newTrip(busA)
    for (const method of ['TELEBIRR', 'CBE_BIRR', 'BANK_TRANSFER']) {
      expect((await sell(sellerA.tok, sale(trip.id, { method }))).status).toBe(400)
      expect((await sell(sellerA.tok, sale(trip.id, { method, reference: 'ab' }))).status).toBe(400)
    }
    expect((await sell(sellerA.tok, sale(trip.id, { method: 'CASH', reference: newRef() }))).status).toBe(400)
    expect((await sell(sellerA.tok, sale(trip.id, { method: 'CARD', reference: newRef() }))).status).toBe(400)
    const ref = newRef()
    const ok = await sell(sellerA.tok, sale(trip.id, { method: 'TELEBIRR', reference: ` ${ref.toLowerCase()} ` }))
    expect(ok.status).toBe(201)
    expect(ok.body.data.booking.payment).toMatchObject({ method: 'TELEBIRR', reference: ref })
  })

  it('does not accept the same receipt number twice for one payment method', async () => {
    const trip = await newTrip(busA)
    const ref = newRef()
    expect((await sell(sellerA.tok, sale(trip.id, { seatNumbers: ['01'], method: 'TELEBIRR', reference: ref }))).status).toBe(201)
    const again = await sell(sellerA2.tok, sale(trip.id, { seatNumbers: ['02'], method: 'TELEBIRR', reference: ref.toLowerCase() }))
    expect(again.status).toBe(409)
    expect(again.body.error).toMatch(/already used/i)
    // The failed sale took no seat
    expect((await sell(sellerA.tok, sale(trip.id, { seatNumbers: ['02'] }))).status).toBe(201)
    // The same number under a different method is a different receipt
    expect((await sell(sellerA.tok, sale(trip.id, { seatNumbers: ['03'], method: 'CBE_BIRR', reference: ref }))).status).toBe(201)
  })

  it('lets only one of two simultaneous sales use the same receipt number', async () => {
    const trip = await newTrip(busA)
    const ref = newRef()
    const results = await Promise.all([
      sell(sellerA.tok, sale(trip.id, { seatNumbers: ['01'], method: 'BANK_TRANSFER', reference: ref })),
      sell(sellerA2.tok, sale(trip.id, { seatNumbers: ['02'], method: 'BANK_TRANSFER', reference: ref })),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    expect(await prisma.payment.count({ where: { method: 'BANK_TRANSFER', reference: ref } })).toBe(1)
  })

  it('does not sell a seat that is already taken, or does not exist, or a seat twice', async () => {
    const trip = await newTrip(busA)
    expect((await sell(sellerA.tok, sale(trip.id, { seatNumbers: ['05'] }))).status).toBe(201)
    const taken = await sell(sellerA2.tok, sale(trip.id, { seatNumbers: ['05'] }))
    expect(taken.status).toBe(409)
    expect(taken.body.error).toMatch(/already booked/i)
    expect((await sell(sellerA.tok, sale(trip.id, { seatNumbers: ['99'] }))).status).toBe(400)
    expect((await sell(sellerA.tok, sale(trip.id, { seatNumbers: ['06', '06'] }))).status).toBe(400)
    expect((await sell(sellerA.tok, sale(trip.id, { seatNumbers: [] }))).status).toBe(400)
  })

  it('never gives the same seat to a counter sale and an online booking at the same moment', async () => {
    const trip = await newTrip(busA)
    for (let i = 1; i <= 6; i++) {
      const seat = String(i).padStart(2, '0')
      const [counter, online] = await Promise.all([
        sell(sellerA.tok, sale(trip.id, { seatNumbers: [seat] })),
        api('POST', '/api/v1/bookings', customer.tok, { scheduleId: trip.id, seatNumbers: [seat], passengers: pax([seat]) }),
      ])
      expect([counter.status, online.status].sort()).toEqual([201, 409])
    }
    // No seat was given out twice
    const all = await prisma.booking.findMany({ where: { scheduleId: trip.id, status: { in: ['PENDING', 'CONFIRMED'] } } })
    const seats = all.flatMap((b) => b.seatNumbers)
    expect(new Set(seats).size).toBe(seats.length)
    expect(seats).toHaveLength(6)
  })

  it('never gives the same seat to two counter sellers at the same moment', async () => {
    const trip = await newTrip(busA)
    const results = await Promise.all(
      [sellerA, sellerA2, managerA, sellerA, sellerA2].map((s) => sell(s.tok, sale(trip.id, { seatNumbers: ['07'] })))
    )
    expect(results.filter((r) => r.status === 201)).toHaveLength(1)
    expect(results.filter((r) => r.status === 409)).toHaveLength(4)
  })

  it('refuses closed and departed trips', async () => {
    const closed = await newTrip(busA, { status: 'CLOSED' })
    const c = await sell(sellerA.tok, sale(closed.id))
    expect(c.status).toBe(409)
    const gone = await newTrip(busA)
    await prisma.schedule.update({ where: { id: gone.id }, data: { departureTime: new Date(Date.now() - 3600000) } })
    expect((await sell(sellerA.tok, sale(gone.id))).status).toBe(400)
  })

  it('requires a pickup point when the company has them on that route, and only its own', async () => {
    const trip = await newTrip(busA, { routeId: routeWithPickups.id })
    const missing = await sell(sellerA.tok, sale(trip.id))
    expect(missing.status).toBe(400)
    expect(missing.body.error).toMatch(/pickup/i)
    // Another company's pickup point is not allowed
    expect((await sell(sellerA.tok, sale(trip.id, { pickupPointId: pickupB.id }))).status).toBe(400)
    const ok = await sell(sellerA.tok, sale(trip.id, { pickupPointId: pickupA.id }))
    expect(ok.status).toBe(201)
    expect(ok.body.data.booking.pickupPoint.name).toBe(pickupA.name)
  })

  it('ties a ticket to the passenger account with that phone, in either written form', async () => {
    const trip = await newTrip(busA)
    const phone = customer.user.phone // 09XXXXXXXX
    const plus = `+251${phone.slice(1)}`
    const walkIn = await sell(sellerA.tok, sale(trip.id, { seatNumbers: ['01'], passengerPhone: plus }))
    expect(walkIn.body.data.booking.userId).toBe(customer.user.id)
    const stranger = await sell(sellerA.tok, sale(trip.id, { seatNumbers: ['02'] }))
    expect(stranger.body.data.booking.userId).toBeNull()

    const mine = await api('GET', '/api/v1/bookings/my', customer.tok)
    const ids = mine.body.data.bookings.map((b: any) => b.id)
    expect(ids).toContain(walkIn.body.data.booking.id)
    expect(ids).not.toContain(stranger.body.data.booking.id)

    // The passenger can't cancel it or pay for it again: only staff can void it
    const cancel = await api('PATCH', `/api/v1/bookings/${walkIn.body.data.booking.id}/cancel`, customer.tok)
    expect(cancel.status).toBe(403)
    const pay = await api('POST', '/api/v1/payments/initialize', customer.tok, { bookingId: walkIn.body.data.booking.id })
    expect(pay.status).toBe(400)
    expect(pay.body.error).toMatch(/counter/i)
  })

  // ─── Who may do what ────────────────────────────────────
  it('lets only sellers and managers sell: not checkers, passengers, the admin, or anonymous callers', async () => {
    const trip = await newTrip(busA)
    expect((await sell(checkerA.tok, sale(trip.id))).status).toBe(403)
    expect((await sell(customer.tok, sale(trip.id))).status).toBe(403)
    expect((await sell(admin.tok, sale(trip.id))).status).toBe(403)
    const anon = await api('POST', '/api/v1/counter/sales', undefined, sale(trip.id))
    expect(anon.status).toBe(401)
    expect(await prisma.booking.count({ where: { scheduleId: trip.id } })).toBe(0)
  })

  it('keeps companies apart: no selling on, listing, voiding or reporting another company', async () => {
    const tripA = await newTrip(busA)
    const tripB = await newTrip(busB)
    // Seller B can't sell on company A's trip; to them it doesn't exist
    expect((await sell(sellerB.tok, sale(tripA.id))).status).toBe(404)
    // A company id sent in the request is ignored
    expect((await sell(sellerB.tok, { ...sale(tripB.id), operatorId: opA.id })).status).toBe(201)

    const made = await sell(sellerA.tok, sale(tripA.id))
    const saleId = made.body.data.booking.id
    expect((await api('POST', `/api/v1/counter/sales/${saleId}/void`, sellerB.tok, { reason: 'trying' })).status).toBe(404)
    expect((await api('POST', `/api/v1/counter/sales/${saleId}/void`, managerB.tok, { reason: 'trying' })).status).toBe(404)

    const listB = await api('GET', '/api/v1/counter/sales', managerB.tok)
    expect(listB.body.data.sales.map((s: any) => s.id)).not.toContain(saleId)
    const tripsB = await api('GET', `/api/v1/counter/trips?date=${new Date(tripA.departureTime.getTime() + 3 * 3600000).toISOString().slice(0, 10)}`, sellerB.tok)
    expect(tripsB.body.data.trips.map((t: any) => t.id)).not.toContain(tripA.id)
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: saleId } })).status).toBe('CONFIRMED')
  })

  it('stops a deactivated seller at once, and lets them back in when restored', async () => {
    const trip = await newTrip(busA)
    const temp = await makeStaff('temp seller', opA.id, 'SELLER')
    expect((await sell(temp.tok, sale(trip.id, { seatNumbers: ['01'] }))).status).toBe(201)
    await prisma.operatorStaff.update({ where: { id: temp.staff.id }, data: { active: false } })
    expect((await sell(temp.tok, sale(trip.id, { seatNumbers: ['02'] }))).status).toBe(403)
    await prisma.operatorStaff.update({ where: { id: temp.staff.id }, data: { active: true } })
    expect((await sell(temp.tok, sale(trip.id, { seatNumbers: ['02'] }))).status).toBe(201)
  })

  // ─── Voiding ────────────────────────────────────────────
  it('lets a seller void their own sale: frees the seats and the receipt number, and keeps a record', async () => {
    const trip = await newTrip(busA)
    const ref = newRef()
    const made = await sell(sellerA.tok, sale(trip.id, { seatNumbers: ['01'], method: 'TELEBIRR', reference: ref }))
    const id = made.body.data.booking.id
    expect(made.body.data.booking.canVoid).toBe(true)

    expect((await api('POST', `/api/v1/counter/sales/${id}/void`, sellerA.tok, {})).status).toBe(400) // needs a reason
    const voided = await api('POST', `/api/v1/counter/sales/${id}/void`, sellerA.tok, { reason: 'Wrong seat' })
    expect(voided.status).toBe(200)
    const row = await prisma.booking.findUniqueOrThrow({ where: { id }, include: { payment: true } })
    expect(row).toMatchObject({ status: 'CANCELLED', voidReason: 'Wrong seat', voidedByStaffId: sellerA.staff.id })
    expect(row.voidedAt).toBeInstanceOf(Date)
    expect(row.payment).toMatchObject({ reference: null, voidedReference: ref })

    // Same seat and the same real receipt can be used for the corrected sale
    const again = await sell(sellerA.tok, sale(trip.id, { seatNumbers: ['01'], method: 'TELEBIRR', reference: ref }))
    expect(again.status).toBe(201)

    // A second void does nothing
    const twice = await api('POST', `/api/v1/counter/sales/${id}/void`, sellerA.tok, { reason: 'again' })
    expect(twice.status).toBe(409)
  })

  it('lets two simultaneous voids of the same sale happen only once', async () => {
    const trip = await newTrip(busA)
    const made = await sell(sellerA.tok, sale(trip.id))
    const id = made.body.data.booking.id
    const results = await Promise.all([
      api('POST', `/api/v1/counter/sales/${id}/void`, sellerA.tok, { reason: 'first' }),
      api('POST', `/api/v1/counter/sales/${id}/void`, managerA.tok, { reason: 'second' }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
  })

  it("stops a seller voiding someone else's sale, or their own after 15 minutes; managers may", async () => {
    const trip = await newTrip(busA)
    const mine = (await sell(sellerA.tok, sale(trip.id, { seatNumbers: ['01'] }))).body.data.booking.id
    const other = (await sell(sellerA2.tok, sale(trip.id, { seatNumbers: ['02'] }))).body.data.booking
    expect(other.canVoid).toBe(true) // seller A2 made it, so for A2 it can be voided

    // Seller A can't void seller A2's sale
    const notMine = await api('POST', `/api/v1/counter/sales/${other.id}/void`, sellerA.tok, { reason: 'not mine' })
    expect(notMine.status).toBe(403)

    // After 15 minutes the seller is refused, the manager is not
    await prisma.booking.update({ where: { id: mine }, data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) } })
    const late = await api('POST', `/api/v1/counter/sales/${mine}/void`, sellerA.tok, { reason: 'too late' })
    expect(late.status).toBe(403)
    expect(late.body.error).toMatch(/15 minutes/)
    const list = await api('GET', '/api/v1/counter/sales', sellerA.tok)
    expect(list.body.data.sales.find((s: any) => s.id === mine).canVoid).toBe(false)
    const byManager = await api('POST', `/api/v1/counter/sales/${mine}/void`, managerA.tok, { reason: 'manager approved' })
    expect(byManager.status).toBe(200)
  })

  it('does not allow voiding after the bus has left, even for a manager', async () => {
    const trip = await newTrip(busA)
    const id = (await sell(sellerA.tok, sale(trip.id))).body.data.booking.id
    await prisma.schedule.update({ where: { id: trip.id }, data: { departureTime: new Date(Date.now() - 60000) } })
    const out = await api('POST', `/api/v1/counter/sales/${id}/void`, managerA.tok, { reason: 'late' })
    expect(out.status).toBe(400)
  })

  it('does not let online bookings be voided through the counter', async () => {
    const trip = await newTrip(busA)
    const online = await api('POST', '/api/v1/bookings', customer.tok, { scheduleId: trip.id, seatNumbers: ['01'], passengers: pax(['01']) })
    expect(online.status).toBe(201)
    const out = await api('POST', `/api/v1/counter/sales/${online.body.data.booking.id}/void`, managerA.tok, { reason: 'nope' })
    expect(out.status).toBe(404)
  })

  // ─── Lists and reports ──────────────────────────────────
  it("shows a seller only their own sales, and a manager the company's", async () => {
    const trip = await newTrip(busA)
    const a = (await sell(sellerA.tok, sale(trip.id, { seatNumbers: ['01'] }))).body.data.booking.id
    const a2 = (await sell(sellerA2.tok, sale(trip.id, { seatNumbers: ['02'] }))).body.data.booking.id
    const forA = (await api('GET', '/api/v1/counter/sales', sellerA.tok)).body.data.sales.map((s: any) => s.id)
    expect(forA).toContain(a)
    expect(forA).not.toContain(a2)
    const forManager = (await api('GET', '/api/v1/counter/sales', managerA.tok)).body.data.sales.map((s: any) => s.id)
    expect(forManager).toEqual(expect.arrayContaining([a, a2]))
    expect((await api('GET', '/api/v1/counter/sales?date=nope', managerA.tok)).status).toBe(400)
  })

  it('lists the trips a seller can sell, for their own company only', async () => {
    const trip = await newTrip(busA, { hoursAhead: 5 })
    const day = new Date(trip.departureTime.getTime() + 3 * 3600000).toISOString().slice(0, 10) // Addis day
    const out = await api('GET', `/api/v1/counter/trips?date=${day}`, sellerA.tok)
    expect(out.status).toBe(200)
    const found = out.body.data.trips.find((t: any) => t.id === trip.id)
    expect(found).toMatchObject({ availableSeats: 10 })
    expect(found.route.fromCity).toBe(route.fromCity)
    // A closed trip is not offered
    await prisma.schedule.update({ where: { id: trip.id }, data: { status: 'CLOSED' } })
    const after = await api('GET', `/api/v1/counter/trips?date=${day}`, sellerA.tok)
    expect(after.body.data.trips.map((t: any) => t.id)).not.toContain(trip.id)
  })

  it('gives managers a daily report per seller and payment method, with voids kept apart', async () => {
    const trip = await newTrip(busC)
    await sell(sellerC1.tok, sale(trip.id, { seatNumbers: ['01', '02'], method: 'CASH' }))
    await sell(sellerC1.tok, sale(trip.id, { seatNumbers: ['03'], method: 'TELEBIRR', reference: newRef() }))
    await sell(sellerC2.tok, sale(trip.id, { seatNumbers: ['04'], method: 'BANK_TRANSFER', reference: newRef() }))
    const toVoid = (await sell(sellerC2.tok, sale(trip.id, { seatNumbers: ['05'], method: 'CASH' }))).body.data.booking.id
    expect((await api('POST', `/api/v1/counter/sales/${toVoid}/void`, sellerC2.tok, { reason: 'customer left' })).status).toBe(200)

    const r = (await api('GET', '/api/v1/counter/report', managerC.tok)).body.data
    expect(r.totals).toEqual({ tickets: 3, seats: 4, total: 400 })
    expect(r.byMethod.CASH).toEqual({ tickets: 1, seats: 2, total: 200 })
    expect(r.byMethod.TELEBIRR).toEqual({ tickets: 1, seats: 1, total: 100 })
    expect(r.byMethod.BANK_TRANSFER).toEqual({ tickets: 1, seats: 1, total: 100 })
    expect(r.voided).toEqual({ tickets: 1, seats: 1, total: 100 })
    const c1 = r.bySeller.find((s: any) => s.staffId === sellerC1.staff.id)
    const c2 = r.bySeller.find((s: any) => s.staffId === sellerC2.staff.id)
    expect(c1).toMatchObject({ tickets: 2, seats: 3, total: 300 })
    expect(c1.byMethod.CASH.total).toBe(200)
    expect(c2).toMatchObject({ tickets: 1, seats: 1, total: 100 })

    // Only managers see it, and only their own company's numbers
    expect((await api('GET', '/api/v1/counter/report', sellerC1.tok)).status).toBe(403)
    expect((await api('GET', '/api/v1/counter/report', checkerA.tok)).status).toBe(403)
    expect((await api('GET', '/api/v1/counter/report', admin.tok)).status).toBe(403)
    const other = (await api('GET', '/api/v1/counter/report', managerB.tok)).body.data
    expect(other.bySeller.map((s: any) => s.staffId)).not.toContain(sellerC1.staff.id)
  })

  // ─── Public ticket ──────────────────────────────────────
  it('shows a ticket to anyone with its code, without the phone number, and marks it void after a void', async () => {
    const trip = await newTrip(busA, { routeId: routeWithPickups.id })
    const phone = newPhone()
    const made = await sell(sellerA.tok, sale(trip.id, { seatNumbers: ['04', '05'], passengerPhone: phone, pickupPointId: pickupA.id }))
    const { id, ticketCode } = made.body.data.booking

    const view = await api('GET', `/api/v1/tickets/${ticketCode}`) // no token
    expect(view.status).toBe(200)
    const t = view.body.data.ticket
    expect(t).toMatchObject({
      code: ticketCode, status: 'VALID', passengerName: 'Abebe Kebede', seatNumbers: ['04', '05'],
      totalPrice: 200, companyName: opA.companyName, fromCity: routeWithPickups.fromCity,
    })
    expect(t.pickupPoint.name).toBe(pickupA.name)
    expect(t.qrCode).toMatch(/^data:image\/png;base64,/)
    expect(JSON.stringify(view.body)).not.toContain(phone.slice(2))
    expect(JSON.stringify(view.body)).not.toContain('passengerPhone')

    expect((await api('GET', `/api/v1/tickets/${ticketCode.toLowerCase()}`)).status).toBe(200)
    expect((await api('GET', '/api/v1/tickets/AAAAAAAA')).status).toBe(404)
    expect((await api('GET', '/api/v1/tickets/short')).status).toBe(404)

    await api('POST', `/api/v1/counter/sales/${id}/void`, sellerA.tok, { reason: 'test' })
    const after = await api('GET', `/api/v1/tickets/${ticketCode}`)
    expect(after.body.data.ticket.status).toBe('VOIDED')
  })

  it('gives every ticket its own code', async () => {
    const trip = await newTrip(busA)
    const codes = new Set<string>()
    for (let i = 1; i <= 8; i++) {
      const out = await sell(sellerA.tok, sale(trip.id, { seatNumbers: [String(i).padStart(2, '0')] }))
      codes.add(out.body.data.booking.ticketCode)
    }
    expect(codes.size).toBe(8)
  })

  // ─── Existing screens still work with walk-in bookings ──
  it('keeps the operator and admin booking lists working when a booking has no account', async () => {
    const trip = await newTrip(busA)
    const made = await sell(sellerA.tok, sale(trip.id, { passengerName: 'Walk In Person' }))
    const id = made.body.data.booking.id
    expect(made.body.data.booking.userId).toBeNull()

    const operatorList = await api('GET', '/api/v1/operator/bookings', managerA.tok)
    expect(operatorList.status).toBe(200)
    const row = operatorList.body.data.bookings.find((b: any) => b.id === id)
    expect(row).toMatchObject({ user: null, passengerName: 'Walk In Person', source: 'COUNTER' })
    expect(operatorList.body.data.totalRevenue).toBeGreaterThanOrEqual(100)

    const adminList = await api('GET', '/api/v1/bookings', admin.tok)
    expect(adminList.status).toBe(200)
    const adminRow = adminList.body.data.bookings.find((b: any) => b.id === id)
    expect(adminRow).toMatchObject({ user: null, passengerName: 'Walk In Person' })
  })
})
