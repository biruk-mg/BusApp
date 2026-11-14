/**
 * Database tests for passenger details (Patch 2): every seat on a booking has its own
 * passenger with a name and their own pickup / drop-off point, and boarding is per
 * passenger. Through the REAL routes over HTTP: route -> permission check -> controller
 * -> database. Chapa is replaced by a fake, so no real payment is ever made.
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
let axiosGet: ReturnType<typeof vi.fn>
let server: http.Server
let baseUrl = ''

const tag = `TEST-${Date.now()}`
let phoneCounter = 0
const newPhone = () => `09${String((Date.now() % 1000000) * 100 + phoneCounter++).padStart(8, '0').slice(-8)}`
let licenseCounter = 0
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

const created = { users: new Set<string>(), operators: new Set<string>(), routes: [] as string[] }

async function makeUser(label: string, role: 'CUSTOMER' | 'OPERATOR') {
  const user = await prisma.user.create({ data: { name: `${tag} ${label}`, phone: newPhone(), password: 'x', role } })
  created.users.add(user.id)
  return { user, tok: token(user.id, role) }
}

async function makeCompany(label: string) {
  const operator = await prisma.operator.create({
    data: { companyName: `${tag} ${label}`, licenseNo: `${tag}-L${licenseCounter++}`, phone: '0900000000', commissionPercent: 5 },
  })
  created.operators.add(operator.id)
  const staff: Record<string, { user: any; tok: string }> = {}
  for (const role of ['MANAGER', 'CHECKER', 'SELLER'] as const) {
    const u = await makeUser(`${label} ${role}`, 'OPERATOR')
    await prisma.operatorStaff.create({ data: { userId: u.user.id, operatorId: operator.id, role } })
    staff[role] = u
  }
  const bus = await prisma.bus.create({ data: { operatorId: operator.id, plateNumber: `${tag}-${label}`, totalSeats: 20 } })
  const dep = new Date(Date.now() + 5 * 3600 * 1000)
  const trip = await prisma.schedule.create({
    data: { routeId: route.id, busId: bus.id, departureTime: dep, arrivalTime: new Date(dep.getTime() + 7200000), price: 120 },
  })
  const point = (name: string, sequence: number, offsetMin: number, kind: 'PICKUP' | 'DROPOFF' | 'BOTH' = 'PICKUP') =>
    prisma.pickupPoint.create({ data: { operatorId: operator.id, routeId: route.id, name: `${label}-${name}`, sequence, offsetMin, kind } })
  const P1 = await point('Megenagna', 1, 0)
  const P2 = await point('Lebu', 2, 30)
  const D1 = await point('Hossana-stop', 9, 120, 'DROPOFF')
  return { operator, staff, bus, trip, P1, P2, D1 }
}
type Company = Awaited<ReturnType<typeof makeCompany>>

let route: any, customer: { user: any; tok: string }, A: Company, B: Company

type Person = { seatNumber: string; name: string; phone?: string; pickupPointId?: string; dropoffPointId?: string }
const book = (company: Company, people: Person[], tok = customer.tok) =>
  api('POST', '/api/v1/bookings', tok, { scheduleId: company.trip.id, seatNumbers: people.map((p) => p.seatNumber), passengers: people })

/** Passengers book, then "pay": Chapa (fake) says the payment succeeded. */
async function bookAndPay(company: Company, people: Person[]) {
  const out = await book(company, people)
  expect(out.status, JSON.stringify(out.body)).toBe(201)
  const booking = out.body.data.booking
  await prisma.payment.create({
    data: { bookingId: booking.id, amount: booking.totalPrice, method: 'TELEBIRR', chapaRef: `ETHIOBUS-${booking.id}-1`, status: 'PENDING' },
  })
  axiosGet.mockResolvedValue({ data: { data: { status: 'success', amount: booking.totalPrice, currency: 'ETB' } } })
  const verified = await api('POST', `/api/v1/payments/verify-booking/${booking.id}`, customer.tok)
  expect(verified.status).toBe(200)
  return booking
}

const list = (company: Company, tok = company.staff.CHECKER.tok) => api('GET', `/api/v1/checkin/trips/${company.trip.id}/passengers`, tok)
const tick = (id: string, tok: string, what: 'board' | 'unboard' = 'board') => api('POST', `/api/v1/checkin/bookings/${id}/${what}`, tok)

describe.skipIf(!TEST_URL)('passenger details: a name and stops for every seat, boarding per passenger (database, real routes)', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    axiosGet = (await import('axios')).default.get as unknown as ReturnType<typeof vi.fn>
    const app = express()
    app.use(express.json())
    app.use('/api/v1/bookings', (await import('../src/routes/booking.routes')).default)
    app.use('/api/v1/payments', (await import('../src/routes/payment.routes')).default)
    app.use('/api/v1/checkin', (await import('../src/routes/checkin.routes')).default)
    app.use('/api/v1/counter', (await import('../src/routes/counter.routes')).default)
    app.use('/api/v1/operator', (await import('../src/routes/operator.routes')).default)
    app.use('/api/v1/tickets', (await import('../src/routes/ticket.routes')).default)
    app.use('/api/v1/admin', (await import('../src/routes/admin.routes')).default)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    customer = await makeUser('Booker Bete', 'CUSTOMER')
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
      await prisma.payment.deleteMany({ where: { booking: { scheduleId: { in: tripIds } } } })
      await prisma.booking.deleteMany({ where: { scheduleId: { in: tripIds } } })
      await prisma.schedule.deleteMany({ where: { id: { in: tripIds } } })
      await prisma.bus.deleteMany({ where: { id: { in: buses.map((b) => b.id) } } })
      await prisma.route.deleteMany({ where: { id: { in: created.routes } } })
      await prisma.operator.deleteMany({ where: { id: { in: ops } } })
      await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } })
      await prisma.$disconnect()
    }
  })

  it('needs a valid name for every seat, and nothing is created when one is missing', async () => {
    const ok = { seatNumber: '01', name: 'Abebe Kebede', pickupPointId: A.P1.id }
    const call = (body: unknown) => api('POST', '/api/v1/bookings', customer.tok, { scheduleId: A.trip.id, ...(body as object) })

    expect((await call({ seatNumbers: ['01'] })).status).toBe(400) // no passengers at all
    expect((await call({ seatNumbers: ['01'], passengers: [] })).status).toBe(400)
    expect((await call({ seatNumbers: ['01', '02'], passengers: [ok] })).status).toBe(400) // 2 seats, 1 passenger
    const wrongSeat = await call({ seatNumbers: ['01'], passengers: [{ ...ok, seatNumber: '02' }] })
    expect(wrongSeat.status).toBe(400)
    expect(wrongSeat.body.error).toMatch(/exactly one passenger/)
    expect((await call({ seatNumbers: ['01', '02'], passengers: [ok, ok] })).status).toBe(400) // same seat twice
    expect((await call({ seatNumbers: ['01'], passengers: [{ ...ok, name: 'A' }] })).status).toBe(400)
    expect((await call({ seatNumbers: ['01'], passengers: [{ ...ok, name: '   ' }] })).status).toBe(400)
    const badPhone = await call({ seatNumbers: ['01'], passengers: [{ ...ok, phone: '12' }] })
    expect(badPhone.status).toBe(400)
    expect(badPhone.body.error).toMatch(/phone/i)

    expect(await prisma.booking.count({ where: { userId: customer.user.id } })).toBe(0)
    // and seat 01 is still free for a correct booking
    expect((await call({ seatNumbers: ['01'], passengers: [ok] })).status).toBe(201)
  })

  it('keeps each passenger with their own name, phone and stops, and gives them back', async () => {
    const out = await book(A, [
      { seatNumber: '05', name: '  Chaltu Bekele ', pickupPointId: A.P1.id },
      { seatNumber: '03', name: 'Dawit Alemu', phone: '0911223344', pickupPointId: A.P2.id, dropoffPointId: A.D1.id },
      { seatNumber: '04', name: 'Eden Tadesse', pickupPointId: A.P1.id },
    ])
    expect(out.status, JSON.stringify(out.body)).toBe(201)
    const booking = out.body.data.booking

    const people = booking.passengers
    expect(people.map((p: any) => p.seatNumber)).toEqual(['03', '04', '05']) // in seat order
    expect(people[0]).toMatchObject({ name: 'Dawit Alemu', pickupPointId: A.P2.id, dropoffPointId: A.D1.id })
    expect(people[0].pickupPoint.name).toBe(A.P2.name)
    expect(people[1]).toMatchObject({ name: 'Eden Tadesse', pickupPointId: A.P1.id, dropoffPointId: null, phone: null })
    expect(people[2].name).toBe('Chaltu Bekele') // trimmed
    const { normalizePhone } = await import('../src/lib/phone')
    expect(people[0].phone).toBe(normalizePhone('0911223344'))

    // The booking keeps the first seat's stops, for screens that only know one stop
    expect(booking.pickupPointId).toBe(A.P2.id)
    expect(booking.dropoffPointId).toBe(A.D1.id)
    expect(booking.seatNumbers.sort()).toEqual(['03', '04', '05'])
    expect(booking.totalPrice).toBe(360)

    const one = await api('GET', `/api/v1/bookings/${booking.id}`, customer.tok)
    expect(one.body.data.booking.passengers).toHaveLength(3)
    const mine = await api('GET', '/api/v1/bookings/my', customer.tok)
    const found = mine.body.data.bookings.find((b: any) => b.id === booking.id)
    expect(found.passengers.map((p: any) => p.name)).toEqual(['Dawit Alemu', 'Eden Tadesse', 'Chaltu Bekele'])
  })

  it('checks the stops of every passenger on their own', async () => {
    const base = { seatNumber: '06', name: 'Fikru Haile' }
    const noPickup = await book(A, [{ ...base }])
    expect(noPickup.status).toBe(400)
    expect(noPickup.body.error).toMatch(/pickup/i)

    // passenger 1 is fine, passenger 2 has no pickup: the whole booking is refused
    const second = await book(A, [{ ...base, pickupPointId: A.P1.id }, { seatNumber: '07', name: 'Genet Worku' }])
    expect(second.status).toBe(400)
    // another company's stop, and a drop-off-only stop used as a pickup
    expect((await book(A, [{ ...base, pickupPointId: B.P1.id }])).status).toBe(400)
    expect((await book(A, [{ ...base, pickupPointId: A.D1.id }])).status).toBe(400)
    // a pickup-only stop used as a drop-off
    expect((await book(A, [{ ...base, pickupPointId: A.P1.id, dropoffPointId: A.P2.id }])).status).toBe(400)

    // nothing was held, so the seats can still be booked correctly
    expect((await book(A, [{ ...base, pickupPointId: A.P1.id }, { seatNumber: '07', name: 'Genet Worku', pickupPointId: A.P2.id }])).status).toBe(201)
  })

  it('lists passengers one by one in the order the bus meets them, and boards them one by one', async () => {
    const booking = await bookAndPay(A, [
      { seatNumber: '13', name: 'Hana Girma', pickupPointId: A.P2.id },
      { seatNumber: '14', name: 'Ibsa Negash', pickupPointId: A.P1.id },
      { seatNumber: '15', name: 'Jemal Ali', phone: '0933445566', pickupPointId: A.P1.id },
    ])
    const lines = (await list(A)).body.data.passengers.filter((p: any) => p.bookingId === booking.id)
    // Megenagna (first stop) before Lebu, then by seat
    expect(lines.map((p: any) => `${p.seatNumbers[0]}:${p.name}:${p.pickupPoint.name}`)).toEqual([
      `14:Ibsa Negash:${A.P1.name}`, `15:Jemal Ali:${A.P1.name}`, `13:Hana Girma:${A.P2.name}`,
    ])
    expect(lines.every((p: any) => p.groupSize === 3 && p.ticketCode === booking.ticketCode && !p.boarded)).toBe(true)

    const [ibsa, jemal, hana] = lines
    // ticking one passenger ticks only that passenger
    const first = await tick(ibsa.id, A.staff.CHECKER.tok)
    expect(first.status).toBe(200)
    expect(first.body.data.alreadyBoarded).toBe(false)
    expect(first.body.data.passenger).toMatchObject({ id: ibsa.id, boarded: true, boardedBy: expect.any(String) })
    const after = (await list(A)).body.data.passengers.filter((p: any) => p.bookingId === booking.id)
    expect(after.map((p: any) => p.boarded)).toEqual([true, false, false])

    // the same passenger again is a warning, not a second tick
    expect((await tick(ibsa.id, A.staff.CHECKER.tok)).body.data.alreadyBoarded).toBe(true)

    // the trip counts seats boarded per passenger
    const { addisDateString } = await import('../src/lib/time')
    const trips = await api('GET', `/api/v1/checkin/trips?date=${addisDateString(A.trip.departureTime)}`, A.staff.CHECKER.tok)
    const t = trips.body.data.trips.find((x: any) => x.id === A.trip.id)
    expect(t.boardedSeats).toBe(1)

    // ticking by the ticket's own id ticks everyone left on it
    const whole = await tick(booking.id, A.staff.CHECKER.tok)
    expect(whole.body.data.alreadyBoarded).toBe(false)
    expect(whole.body.data.passengers.every((p: any) => p.boarded)).toBe(true)
    expect(whole.body.data.passengers.find((p: any) => p.id === ibsa.id).boardedAt).toBeTruthy()
    expect((await tick(booking.id, A.staff.CHECKER.tok)).body.data.alreadyBoarded).toBe(true)

    // un-ticking one passenger leaves the others boarded
    const undone = await tick(jemal.id, A.staff.CHECKER.tok, 'unboard')
    expect(undone.body.data.passenger).toMatchObject({ id: jemal.id, boarded: false, boardedBy: null })
    const final = (await list(A)).body.data.passengers.filter((p: any) => p.bookingId === booking.id)
    expect(final.map((p: any) => `${p.name}:${p.boarded}`)).toEqual(['Ibsa Negash:true', 'Jemal Ali:false', 'Hana Girma:true'])
    expect(hana.id).toBeTruthy()
  })

  it('shows every passenger when a ticket is scanned, and says when all of them are on board', async () => {
    const booking = await bookAndPay(A, [
      { seatNumber: '16', name: 'Kebede Tolla', pickupPointId: A.P1.id },
      { seatNumber: '17', name: 'Lemlem Assefa', pickupPointId: A.P2.id },
    ])
    const look = () => api('GET', `/api/v1/checkin/lookup/${booking.ticketCode}`, A.staff.CHECKER.tok)

    const first = await look()
    expect(first.body.data.state).toBe('OK')
    expect(first.body.data.passengers.map((p: any) => p.name)).toEqual(['Kebede Tolla', 'Lemlem Assefa'])
    expect(first.body.data.passenger).toMatchObject({ id: booking.id, name: 'Kebede Tolla +1', seatNumbers: ['16', '17'], boarded: false })

    await tick(first.body.data.passengers[0].id, A.staff.CHECKER.tok)
    const half = await look()
    expect(half.body.data.state).toBe('OK') // one is still to come
    expect(half.body.data.passenger.boarded).toBe(false)

    await tick(first.body.data.passengers[1].id, A.staff.CHECKER.tok)
    const full = await look()
    expect(full.body.data.state).toBe('ALREADY_BOARDED')
    expect(full.body.data.passenger.boarded).toBe(true)
  })

  it('keeps other companies out, and does not board unpaid or cancelled tickets', async () => {
    const paid = await bookAndPay(A, [{ seatNumber: '18', name: 'Mulu Desta', pickupPointId: A.P1.id }])
    const paidPerson = (await list(A)).body.data.passengers.find((p: any) => p.bookingId === paid.id)
    // company B's checker cannot see or tick company A's passenger
    expect((await tick(paidPerson.id, B.staff.CHECKER.tok)).status).toBe(404)
    expect((await tick(paid.id, B.staff.CHECKER.tok)).status).toBe(404)
    expect((await api('GET', `/api/v1/checkin/lookup/${paid.ticketCode}`, B.staff.CHECKER.tok)).status).toBe(404)
    expect((await list(A, B.staff.CHECKER.tok)).status).toBe(404)

    // an unpaid hold is not on the list and cannot be ticked, not even by passenger id
    const hold = await book(A, [{ seatNumber: '19', name: 'Nardos Fekadu', pickupPointId: A.P1.id }])
    expect(hold.status).toBe(201)
    const holdPerson = hold.body.data.booking.passengers[0]
    expect((await tick(holdPerson.id, A.staff.CHECKER.tok)).status).toBe(409)
    expect((await tick(hold.body.data.booking.id, A.staff.CHECKER.tok)).status).toBe(409)
    expect((await list(A)).body.data.passengers.some((p: any) => p.bookingId === hold.body.data.booking.id)).toBe(false)
  })

  it('gives counter tickets a passenger per seat too, boarded one by one', async () => {
    const sale = await api('POST', '/api/v1/counter/sales', A.staff.SELLER.tok, {
      scheduleId: A.trip.id, seatNumbers: ['08', '09'], pickupPointId: A.P1.id,
      passengerName: 'Walk In Woman', passengerPhone: '0922334455', method: 'CASH',
    })
    expect(sale.status, JSON.stringify(sale.body)).toBe(201)
    const id = sale.body.data.booking.id
    const rows = await prisma.bookingPassenger.findMany({ where: { bookingId: id }, orderBy: { seatNumber: 'asc' } })
    expect(rows.map((r) => `${r.seatNumber}:${r.name}`)).toEqual(['08:Walk In Woman', '09:Walk In Woman'])

    const lines = (await list(A)).body.data.passengers.filter((p: any) => p.bookingId === id)
    expect(lines).toHaveLength(2)
    await tick(lines[0].id, A.staff.CHECKER.tok)
    const after = (await list(A)).body.data.passengers.filter((p: any) => p.bookingId === id)
    expect(after.map((p: any) => p.boarded)).toEqual([true, false])
  })

  it('still handles a ticket from before passengers were recorded, as one line for the whole booking', async () => {
    const trip2 = await prisma.schedule.create({
      data: { routeId: route.id, busId: A.bus.id, departureTime: new Date(Date.now() + 9 * 3600 * 1000), arrivalTime: new Date(Date.now() + 11 * 3600 * 1000), price: 100 },
    })
    const old = await prisma.booking.create({
      data: { userId: customer.user.id, scheduleId: trip2.id, seatNumbers: ['01', '02'], totalPrice: 200, status: 'CONFIRMED', qrCode: `${tag}-old`, ticketCode: `OLD${String(Date.now()).slice(-5)}`, passengerName: 'Old Timer', pickupPointId: A.P1.id },
    })
    const res = await api('GET', `/api/v1/checkin/trips/${trip2.id}/passengers`, A.staff.CHECKER.tok)
    expect(res.body.data.passengers).toHaveLength(1)
    expect(res.body.data.passengers[0]).toMatchObject({ id: old.id, name: 'Old Timer', seatNumbers: ['01', '02'], groupSize: 1, boarded: false })
    const ticked = await tick(old.id, A.staff.CHECKER.tok)
    expect(ticked.body.data.passenger.boarded).toBe(true)
    const { addisDateString } = await import('../src/lib/time')
    const trips = await api('GET', `/api/v1/checkin/trips?date=${addisDateString(trip2.departureTime)}`, A.staff.CHECKER.tok)
    expect(trips.body.data.trips.find((x: any) => x.id === trip2.id).boardedSeats).toBe(2)
  })

  it('shows each passenger on the public ticket, without phone numbers', async () => {
    const booking = await bookAndPay(A, [
      { seatNumber: '10', name: 'Olana Tesfaye', phone: '0944556677', pickupPointId: A.P1.id, dropoffPointId: A.D1.id },
      { seatNumber: '11', name: 'Pawlos Mengistu', pickupPointId: A.P2.id },
    ])
    const page = await api('GET', `/api/v1/tickets/${booking.ticketCode}`)
    expect(page.status).toBe(200)
    expect(page.body.data.ticket.passengers).toEqual([
      { seatNumber: '10', name: 'Olana Tesfaye', pickupPoint: { name: A.P1.name, offsetMin: 0 }, dropoffPoint: { name: A.D1.name } },
      { seatNumber: '11', name: 'Pawlos Mengistu', pickupPoint: { name: A.P2.name, offsetMin: 30 }, dropoffPoint: null },
    ])
    expect(JSON.stringify(page.body)).not.toContain('0944556677')
    expect(JSON.stringify(page.body)).not.toContain('944556677')
  })

  it('does not cancel or refund a ticket once any passenger on it has boarded', async () => {
    const admin = await prisma.user.create({ data: { name: `${tag} Admin`, phone: newPhone(), password: 'x', role: 'ADMIN' } })
    created.users.add(admin.id)
    const adminTok = token(admin.id, 'ADMIN')

    const C = await makeCompany('C') // a trip of its own, so the seats are free
    const booking = await bookAndPay(C, [
      { seatNumber: '01', name: 'Sara Yilma', pickupPointId: C.P1.id },
      { seatNumber: '02', name: 'Tesfaye Gebre', pickupPointId: C.P1.id },
    ])
    // before anyone boards, cancelling is still possible (checked without doing it: preview)
    const person = (await list(C)).body.data.passengers.find((p: any) => p.bookingId === booking.id && p.name === 'Tesfaye Gebre')
    expect((await tick(person.id, C.staff.CHECKER.tok)).status).toBe(200)

    // one of two has boarded: the passenger cannot cancel, nor can the admin
    const byPassenger = await api('PATCH', `/api/v1/bookings/${booking.id}/cancel`, customer.tok)
    expect(byPassenger.status).toBe(400)
    expect(byPassenger.body.error).toMatch(/already boarded/)
    expect((await api('PATCH', `/api/v1/bookings/${booking.id}/cancel`, adminTok)).status).toBe(400)
    // and the money cannot be refunded either
    const refund = await api('POST', `/api/v1/admin/bookings/${booking.id}/refund`, adminTok, {})
    expect(refund.status).toBe(409)
    expect(refund.body.error).toMatch(/already boarded/)
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CONFIRMED')

    // un-ticking the passenger makes cancelling possible again
    await tick(person.id, C.staff.CHECKER.tok, 'unboard')
    expect((await api('PATCH', `/api/v1/bookings/${booking.id}/cancel`, customer.tok)).status).toBe(200)
    // a cancelled ticket cannot be boarded
    expect((await tick(person.id, C.staff.CHECKER.tok)).status).toBe(409)
  })

  it('does not let a stop be deleted once a passenger uses it', async () => {
    // P1 is only a passenger stop here (this booking's own stop is P2)
    const out = await book(A, [
      { seatNumber: '12', name: 'Qalbessa Dinsa', pickupPointId: A.P2.id },
      { seatNumber: '20', name: 'Rahel Mekonnen', pickupPointId: A.P1.id },
    ])
    expect(out.status).toBe(201)
    const del = await api('DELETE', `/api/v1/operator/pickups/${A.P1.id}`, A.staff.MANAGER.tok)
    expect(del.status).toBe(409)
    expect(del.body.error).toMatch(/cannot be deleted/)
    // a stop nobody used can still be deleted
    const spare = await prisma.pickupPoint.create({ data: { operatorId: A.operator.id, routeId: route.id, name: `${tag}-spare`, kind: 'PICKUP' } })
    expect((await api('DELETE', `/api/v1/operator/pickups/${spare.id}`, A.staff.MANAGER.tok)).status).toBe(200)
  })
})
