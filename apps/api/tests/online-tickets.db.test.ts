/**
 * Database tests for online tickets (Patch F2): every online booking gets a ticket
 * code that the QR holds, the company's commission is frozen when Chapa confirms
 * the payment, and a ticket checker can verify an online ticket on the server.
 *
 * Chapa itself is replaced by a fake, so no real payment is ever made.
 * Only run when TEST_DATABASE_URL is set; refuse to run against DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import dotenv from 'dotenv'
import http from 'http'
import type { AddressInfo } from 'net'
import express from 'express'
import jwt from 'jsonwebtoken'
import QRCode from 'qrcode'

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

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

async function makeCompany(label: string, commissionPercent: number) {
  const operator = await prisma.operator.create({
    data: { companyName: `${tag} ${label}`, licenseNo: `${tag}-L${licenseCounter++}`, phone: '0900000000', commissionPercent },
  })
  created.operators.add(operator.id)
  const checker = await makeUser(`${label} checker`, 'OPERATOR')
  await prisma.operatorStaff.create({ data: { userId: checker.user.id, operatorId: operator.id, role: 'CHECKER' } })
  const bus = await prisma.bus.create({ data: { operatorId: operator.id, plateNumber: `${tag}-${label}`, totalSeats: 20 } })
  const dep = new Date(Date.now() + 5 * 3600 * 1000)
  const trip = await prisma.schedule.create({
    data: { routeId: route.id, busId: bus.id, departureTime: dep, arrivalTime: new Date(dep.getTime() + 7200000), price: 120 },
  })
  return { operator, checker, bus, trip }
}
type Company = Awaited<ReturnType<typeof makeCompany>>

let route: any, customer: { user: any; tok: string }, A: Company, B: Company, zero: Company

/** The passenger books seats, then "pays": Chapa (fake) says the payment succeeded. */
async function bookAndPay(company: Company, seat: string) {
  const out = await api('POST', '/api/v1/bookings', customer.tok, { scheduleId: company.trip.id, seatNumbers: [seat], passengers: pax([seat]) })
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

describe.skipIf(!TEST_URL)('online tickets: ticket code, frozen commission, verification (database, real routes)', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    axiosGet = (await import('axios')).default.get as unknown as ReturnType<typeof vi.fn>
    const app = express()
    app.use(express.json())
    app.use('/api/v1/bookings', (await import('../src/routes/booking.routes')).default)
    app.use('/api/v1/payments', (await import('../src/routes/payment.routes')).default)
    app.use('/api/v1/checkin', (await import('../src/routes/checkin.routes')).default)
    app.use('/api/v1/tickets', (await import('../src/routes/ticket.routes')).default)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    customer = await makeUser('Passenger Paula', 'CUSTOMER')
    route = await prisma.route.create({ data: { fromCity: `${tag}-From`, toCity: `${tag}-To`, distanceKm: 100, estimatedDurationMin: 120 } })
    created.routes.push(route.id)
    A = await makeCompany('A', 5)
    B = await makeCompany('B', 5)
    zero = await makeCompany('Zero', 0)
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

  it('gives every online booking a ticket code, and the QR holds that code', async () => {
    const out = await api('POST', '/api/v1/bookings', customer.tok, { scheduleId: A.trip.id, seatNumbers: ['01'], passengers: pax(['01']) })
    expect(out.status).toBe(201)
    const { ticketCode, qrCode } = out.body.data.booking
    expect(ticketCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    expect(qrCode).toBe(await QRCode.toDataURL(ticketCode)) // the picture is exactly the code, nothing else
    expect(qrCode).not.toContain(customer.user.id)

    // Two bookings never share a code
    const other = await api('POST', '/api/v1/bookings', customer.tok, { scheduleId: A.trip.id, seatNumbers: ['02'], passengers: pax(['02']) })
    expect(other.body.data.booking.ticketCode).not.toBe(ticketCode)
  })

  it("freezes the company's commission rate when the payment is confirmed", async () => {
    const booking = await bookAndPay(A, '03')
    let row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
    expect(row.status).toBe('CONFIRMED')
    expect(row.commissionPercent).toBe(5) // the company's rate when it was paid
    expect(await prisma.booking.findFirstOrThrow({ where: { id: booking.id } })).toBeTruthy()

    // The company's rate changes later: this sale keeps the rate it was made at
    await prisma.operator.update({ where: { id: A.operator.id }, data: { commissionPercent: 12 } })
    row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
    expect(row.commissionPercent).toBe(5)
    // A confirmation seen again (Chapa's callback and the passenger's page both fire) changes nothing
    expect((await api('POST', `/api/v1/payments/verify-booking/${booking.id}`, customer.tok)).status).toBe(200)
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).commissionPercent).toBe(5)

    // New sales use the new rate
    const later = await bookAndPay(A, '04')
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: later.id } })).commissionPercent).toBe(12)
    await prisma.operator.update({ where: { id: A.operator.id }, data: { commissionPercent: 5 } })
  })

  it('freezes a 0% rate as 0%, not as "missing"', async () => {
    const booking = await bookAndPay(zero, '01')
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).commissionPercent).toBe(0)
  })

  it('lets a ticket checker verify an online ticket by its code, for their own company only', async () => {
    const booking = await bookAndPay(B, '05')
    const code = booking.ticketCode

    const ok = await api('GET', `/api/v1/checkin/lookup/${code}`, B.checker.tok)
    expect(ok.status).toBe(200)
    expect(ok.body.data.state).toBe('OK')
    expect(ok.body.data.passenger).toMatchObject({ ticketCode: code })
    expect(JSON.stringify(ok.body)).toContain('Test Passenger')

    // Lower case, as typed on a phone, still works (the web app also removes spaces and dashes)
    const typed = await api('GET', `/api/v1/checkin/lookup/${code.toLowerCase()}`, B.checker.tok)
    expect(typed.body.data.state).toBe('OK')

    // Another company's checker learns nothing about this ticket
    expect((await api('GET', `/api/v1/checkin/lookup/${code}`, A.checker.tok)).status).toBe(404)
  })

  it('does not accept the ticket of a booking that was never paid', async () => {
    const out = await api('POST', '/api/v1/bookings', customer.tok, { scheduleId: B.trip.id, seatNumbers: ['06'], passengers: pax(['06']) })
    const lookup = await api('GET', `/api/v1/checkin/lookup/${out.body.data.booking.ticketCode}`, B.checker.tok)
    expect(lookup.status).toBe(200)
    expect(lookup.body.data.state).toBe('VOIDED')
  })

  it('warns when the same ticket is shown twice', async () => {
    const booking = await bookAndPay(B, '07')
    const first = await api('POST', `/api/v1/checkin/bookings/${booking.id}/board`, B.checker.tok, { boarded: true })
    expect(first.status).toBe(200)
    expect(first.body.data.alreadyBoarded).toBe(false)
    expect(first.body.data.passenger.boarded).toBe(true)

    const second = await api('POST', `/api/v1/checkin/bookings/${booking.id}/board`, B.checker.tok, { boarded: true })
    expect(second.status).toBe(200)
    expect(second.body.data.alreadyBoarded).toBe(true)

    const lookup = await api('GET', `/api/v1/checkin/lookup/${booking.ticketCode}`, B.checker.tok)
    expect(lookup.body.data.state).toBe('ALREADY_BOARDED')

    // Taking someone off the list is not a "reuse"
    const off = await api('POST', `/api/v1/checkin/bookings/${booking.id}/unboard`, B.checker.tok)
    expect(off.body.data.alreadyBoarded).toBe(false)
    expect(off.body.data.passenger.boarded).toBe(false)
  })

  it("shows an online ticket on the public ticket page with the passenger's name and nothing private", async () => {
    const booking = await bookAndPay(B, '08')
    const page = await api('GET', `/api/v1/tickets/${booking.ticketCode}`)
    expect(page.status).toBe(200)
    expect(JSON.stringify(page.body)).toContain('Passenger Paula')
    const text = JSON.stringify(page.body)
    expect(text).not.toContain(customer.user.phone)
    expect(text).not.toContain('commissionPercent')
  })
})
