/**
 * Database tests for cancellation and refunds (G6): the Refund Policy tiers
 * (100% / 50% / 0%), what the admin has to send back, and what the company keeps.
 * Through the REAL routes over HTTP. Chapa is replaced by a fake.
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
const token = (userId: string, role: string) => jwt.sign({ userId, role }, process.env.JWT_SECRET!)
const H = 3_600_000

async function api(method: string, path: string, tok?: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any }
}

const created = { users: new Set<string>(), operators: new Set<string>(), routes: [] as string[] }
async function makeUser(label: string, role: 'CUSTOMER' | 'OPERATOR' | 'ADMIN') {
  const user = await prisma.user.create({ data: { name: `${tag} ${label}`, phone: newPhone(), password: 'x', role } })
  created.users.add(user.id)
  return { user, tok: token(user.id, role) }
}

let route: any, admin: { user: any; tok: string }, passenger: { user: any; tok: string }, stranger: { user: any; tok: string }
let company: any, bus: any, checker: { user: any; tok: string }
let seatCounter = 0

/** A fresh trip of the company, leaving `hours` from now, at ETB 120 a seat. */
async function tripIn(hours: number) {
  const dep = new Date(Date.now() + hours * H)
  return prisma.schedule.create({
    data: { routeId: route.id, busId: bus.id, departureTime: dep, arrivalTime: new Date(dep.getTime() + 2 * H), price: 120 },
  })
}

/** The passenger books one seat and pays (Chapa fake says success). */
async function bookAndPay(hours: number, pay = true) {
  const trip = await tripIn(hours)
  const seat = String(++seatCounter).padStart(2, '0')
  const out = await api('POST', '/api/v1/bookings', passenger.tok, { scheduleId: trip.id, seatNumbers: [seat], passengers: pax([seat]) })
  expect(out.status, JSON.stringify(out.body)).toBe(201)
  const booking = out.body.data.booking
  if (pay) {
    await prisma.payment.create({
      data: { bookingId: booking.id, amount: booking.totalPrice, method: 'TELEBIRR', chapaRef: `ETHIOBUS-${booking.id}-1`, status: 'PENDING' },
    })
    axiosGet.mockResolvedValue({ data: { data: { status: 'success', amount: booking.totalPrice, currency: 'ETB' } } })
    expect((await api('POST', `/api/v1/payments/verify-booking/${booking.id}`, passenger.tok)).status).toBe(200)
  }
  return booking
}

const attention = async () => (await api('GET', '/api/v1/admin/attention', admin.tok)).body.data.items as any[]
const refundItem = async (bookingId: string) => (await attention()).find((i) => i.kind === 'REFUND_NEEDED' && i.bookingId === bookingId)
const earnings = async () => (await api('GET', `/api/v1/admin/operators/${company.id}/earnings`, admin.tok)).body.data

describe.skipIf(!TEST_URL)('cancellation and refunds (database, real routes)', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    axiosGet = (await import('axios')).default.get as unknown as ReturnType<typeof vi.fn>
    const app = express()
    app.use(express.json())
    app.use('/api/v1/bookings', (await import('../src/routes/booking.routes')).default)
    app.use('/api/v1/payments', (await import('../src/routes/payment.routes')).default)
    app.use('/api/v1/checkin', (await import('../src/routes/checkin.routes')).default)
    app.use('/api/v1/admin', (await import('../src/routes/admin.routes')).default)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    admin = await makeUser('admin', 'ADMIN')
    passenger = await makeUser('Passenger', 'CUSTOMER')
    stranger = await makeUser('Stranger', 'CUSTOMER')
    route = await prisma.route.create({ data: { fromCity: `${tag}-From`, toCity: `${tag}-To`, distanceKm: 100, estimatedDurationMin: 120 } })
    created.routes.push(route.id)
    company = await prisma.operator.create({
      data: { companyName: `${tag} Co`, licenseNo: `${tag}-L`, phone: '0900000000', commissionPercent: 5 },
    })
    created.operators.add(company.id)
    bus = await prisma.bus.create({ data: { operatorId: company.id, plateNumber: `${tag}-B`, totalSeats: 40 } })
    checker = await makeUser('checker', 'OPERATOR')
    await prisma.operatorStaff.create({ data: { userId: checker.user.id, operatorId: company.id, role: 'CHECKER' } })
  })

  afterAll(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
    if (prisma) {
      const trips = await prisma.schedule.findMany({ where: { busId: bus?.id }, select: { id: true } })
      const ids = trips.map((t) => t.id)
      await prisma.payment.deleteMany({ where: { booking: { scheduleId: { in: ids } } } })
      await prisma.booking.deleteMany({ where: { scheduleId: { in: ids } } })
      await prisma.schedule.deleteMany({ where: { id: { in: ids } } })
      await prisma.operatorStaff.deleteMany({ where: { operatorId: company?.id } })
      await prisma.bus.deleteMany({ where: { id: bus?.id } })
      await prisma.route.deleteMany({ where: { id: { in: created.routes } } })
      await prisma.operator.deleteMany({ where: { id: { in: [...created.operators] } } })
      await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } })
      await prisma.$disconnect()
    }
  })

  it('gives 100% back when the trip is 24 hours or more away, and the admin has to send it', async () => {
    const b = await bookAndPay(30)
    const preview = await api('GET', `/api/v1/bookings/${b.id}/refund-preview`, passenger.tok)
    expect(preview.body.data).toMatchObject({ paid: true, percent: 100, refundAmount: 120, keepAmount: 0 })

    const out = await api('PATCH', `/api/v1/bookings/${b.id}/cancel`, passenger.tok)
    expect(out.status, JSON.stringify(out.body)).toBe(200)
    const row = await prisma.booking.findUnique({ where: { id: b.id } })
    expect(row).toMatchObject({ status: 'CANCELLED', refundPercent: 100, refundAmount: 120 })
    expect(row!.cancelledAt).not.toBeNull()

    const item = await refundItem(b.id)
    expect(item.title).toBe('Refund needed: ETB 120')
    expect(item.detail).toContain('full refund')
  })

  it('gives 50% back between 6 and 24 hours: the passenger is owed half, the company keeps half (less commission)', async () => {
    const before = (await earnings()).summary
    const b = await bookAndPay(10)
    const afterPay = (await earnings()).summary
    expect(afterPay.gross - before.gross).toBe(120)

    const preview = await api('GET', `/api/v1/bookings/${b.id}/refund-preview`, passenger.tok)
    expect(preview.body.data).toMatchObject({ percent: 50, refundAmount: 60, keepAmount: 60 })
    expect((await api('PATCH', `/api/v1/bookings/${b.id}/cancel`, passenger.tok)).status).toBe(200)

    const item = await refundItem(b.id)
    expect(item.title).toBe('Refund needed: ETB 60')
    expect(item.detail).toContain('50% back')

    // The company earned the half it kept: 60 gross, 5% commission = 3, net 57. Not a travelling ticket.
    const afterCancel = (await earnings()).summary
    expect(afterCancel.gross - before.gross).toBe(60)
    expect(afterCancel.commission - before.commission).toBe(3)
    expect(afterCancel.net - before.net).toBe(57)
    expect(afterCancel.tickets).toBe(afterPay.tickets - 1)
  })

  it('gives nothing back under 6 hours: no refund to send, the company keeps the whole price', async () => {
    const before = (await earnings()).summary
    const b = await bookAndPay(3)
    const out = await api('PATCH', `/api/v1/bookings/${b.id}/cancel`, passenger.tok)
    expect(out.status).toBe(200)
    expect(out.body.message).toContain('no refund')
    expect(await prisma.booking.findUnique({ where: { id: b.id } })).toMatchObject({ refundPercent: 0, refundAmount: 0 })
    expect(await refundItem(b.id)).toBeUndefined()

    const after = (await earnings()).summary
    expect(after.gross - before.gross).toBe(120)

    // The admin can't record a refund that the policy does not give
    const rec = await api('POST', `/api/v1/admin/bookings/${b.id}/refund`, admin.tok, {})
    expect(rec.status).toBe(409)
  })

  it('keeps the company\'s share after the admin records the 50% refund, and the item leaves the list', async () => {
    const b = await bookAndPay(12)
    await api('PATCH', `/api/v1/bookings/${b.id}/cancel`, passenger.tok)
    const before = (await earnings()).summary
    expect(await refundItem(b.id)).toBeDefined()

    const rec = await api('POST', `/api/v1/admin/bookings/${b.id}/refund`, admin.tok, { reference: 'TB123' })
    expect(rec.status, JSON.stringify(rec.body)).toBe(200)
    expect(await refundItem(b.id)).toBeUndefined()
    expect((await earnings()).summary.gross).toBe(before.gross) // still the 60 it kept
    expect((await api('POST', `/api/v1/admin/bookings/${b.id}/refund`, admin.tok, {})).status).toBe(409)
  })

  it('refunds 100% when the admin cancels, however close the trip is', async () => {
    const b = await bookAndPay(2)
    const out = await api('PATCH', `/api/v1/bookings/${b.id}/cancel`, admin.tok)
    expect(out.status).toBe(200)
    expect(await prisma.booking.findUnique({ where: { id: b.id } })).toMatchObject({ refundPercent: 100, refundAmount: 120 })
    expect((await refundItem(b.id)).title).toBe('Refund needed: ETB 120')
  })

  it('an admin refund of a live ticket cancels it and records a full refund', async () => {
    const b = await bookAndPay(2)
    const rec = await api('POST', `/api/v1/admin/bookings/${b.id}/refund`, admin.tok, {})
    expect(rec.status).toBe(200)
    expect(await prisma.booking.findUnique({ where: { id: b.id } })).toMatchObject({ status: 'CANCELLED', refundPercent: 100, refundAmount: 120 })
  })

  it('cancelling an unpaid hold has no refund at all', async () => {
    const b = await bookAndPay(30, false)
    const preview = await api('GET', `/api/v1/bookings/${b.id}/refund-preview`, passenger.tok)
    expect(preview.body.data).toMatchObject({ paid: false, percent: null, refundAmount: null })
    expect((await api('PATCH', `/api/v1/bookings/${b.id}/cancel`, passenger.tok)).status).toBe(200)
    expect(await prisma.booking.findUnique({ where: { id: b.id } })).toMatchObject({ status: 'CANCELLED', refundPercent: null, refundAmount: null })
    expect(await refundItem(b.id)).toBeUndefined()
  })

  it('keeps the old rule for older cancellations: no amount set means the full price is refunded', async () => {
    const b = await bookAndPay(30)
    await prisma.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } }) // as before G6
    expect((await refundItem(b.id)).title).toBe('Refund needed: ETB 120')
  })

  it('does not let a stranger cancel or preview, or anyone cancel twice, or cancel after boarding or departure', async () => {
    const b = await bookAndPay(30)
    expect((await api('PATCH', `/api/v1/bookings/${b.id}/cancel`, stranger.tok)).status).toBe(403)
    expect((await api('GET', `/api/v1/bookings/${b.id}/refund-preview`, stranger.tok)).status).toBe(403)
    expect((await api('PATCH', `/api/v1/bookings/${b.id}/cancel`)).status).toBe(401)
    expect((await api('PATCH', `/api/v1/bookings/${b.id}/cancel`, passenger.tok)).status).toBe(200)
    expect((await api('PATCH', `/api/v1/bookings/${b.id}/cancel`, passenger.tok)).status).toBe(400)

    // Boarded
    const boarded = await bookAndPay(30)
    await prisma.booking.update({ where: { id: boarded.id }, data: { boardedAt: new Date() } })
    const noBoard = await api('PATCH', `/api/v1/bookings/${boarded.id}/cancel`, passenger.tok)
    expect(noBoard.status).toBe(400)
    expect(noBoard.body.error).toContain('boarded')

    // Departed: the passenger cannot, the admin can (and then it is a full refund)
    const gone = await bookAndPay(30)
    await prisma.schedule.update({ where: { id: gone.scheduleId }, data: { departureTime: new Date(Date.now() - H) } })
    const late = await api('PATCH', `/api/v1/bookings/${gone.id}/cancel`, passenger.tok)
    expect(late.status).toBe(400)
    expect(late.body.error).toContain('departed')
    expect((await api('PATCH', `/api/v1/bookings/${gone.id}/cancel`, admin.tok)).status).toBe(200)
  })

  it('frees the seat again after a cancellation', async () => {
    const b = await bookAndPay(30)
    await api('PATCH', `/api/v1/bookings/${b.id}/cancel`, passenger.tok)
    const again = await api('POST', '/api/v1/bookings', passenger.tok, { scheduleId: b.scheduleId, seatNumbers: b.seatNumbers, passengers: pax(b.seatNumbers) })
    expect(again.status, JSON.stringify(again.body)).toBe(201)
  })
})
