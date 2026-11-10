/**
 * Database tests for payouts and refunds (Patch F2): what each company is owed
 * (online sales minus the platform's share), recording payouts, voiding them,
 * and refunds. Through the REAL routes over HTTP.
 *
 * Only run when TEST_DATABASE_URL is set; refuse to run against DATABASE_URL.
 * They create their own rows (marked TEST-) and remove them afterwards.
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
let phoneCounter = 0
const newPhone = () => `09${String((Date.now() % 1000000) * 100 + phoneCounter++).padStart(8, '0').slice(-8)}`
let licenseCounter = 0
const newLicense = () => `${tag}-L${licenseCounter++}`
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

async function makeUser(label: string, role: 'CUSTOMER' | 'OPERATOR' | 'ADMIN') {
  const user = await prisma.user.create({ data: { name: `${tag} ${label}`, phone: newPhone(), password: 'x', role } })
  created.users.add(user.id)
  return { user, tok: token(user.id, role) }
}

async function makeCompany(label: string, over: Record<string, unknown> = {}) {
  const operator = await prisma.operator.create({
    data: { companyName: `${tag} ${label}`, licenseNo: newLicense(), phone: '0900000000', ...over },
  })
  created.operators.add(operator.id)
  const mk = async (role: 'MANAGER' | 'SELLER' | 'CHECKER') => {
    const u = await makeUser(`${label} ${role}`, 'OPERATOR')
    await prisma.operatorStaff.create({ data: { userId: u.user.id, operatorId: operator.id, role } })
    return u
  }
  const manager = await mk('MANAGER')
  const seller = await mk('SELLER')
  const checker = await mk('CHECKER')
  const bus = await prisma.bus.create({ data: { operatorId: operator.id, plateNumber: `${tag}-${label}-1`, totalSeats: 20 } })
  return { operator, manager, seller, checker, bus }
}
type Company = Awaited<ReturnType<typeof makeCompany>>

let route: any, admin: { user: any; tok: string }, customer: { user: any; tok: string }

let tripCounter = 0
const makeTrip = (c: Company, hoursFromNow: number) => {
  const dep = new Date(Date.now() + hoursFromNow * 3600 * 1000 + tripCounter++ * 60000)
  return prisma.schedule.create({
    data: { routeId: route.id, busId: c.bus.id, departureTime: dep, arrivalTime: new Date(dep.getTime() + 7200000), price: 100 },
  })
}

let bookingCounter = 0
async function makeBooking(
  trip: { id: string },
  o: {
    price: number
    source?: 'ONLINE' | 'COUNTER'
    status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED'
    commission?: number | null
    payment?: 'SUCCESS' | 'PENDING' | 'NONE'
    refunded?: boolean
    boarded?: boolean
    ticketCode?: string
  }
) {
  const n = bookingCounter++
  const source = o.source ?? 'ONLINE'
  const payment = o.payment ?? 'SUCCESS'
  return prisma.booking.create({
    data: {
      userId: source === 'ONLINE' ? customer.user.id : null,
      scheduleId: trip.id,
      seatNumbers: [String(n + 1).padStart(2, '0')],
      totalPrice: o.price,
      status: o.status ?? 'CONFIRMED',
      source,
      passengerName: source === 'COUNTER' ? 'Walk-in' : null,
      qrCode: `${tag}-qr-${n}`,
      ticketCode: o.ticketCode ?? null,
      commissionPercent: o.commission === undefined ? null : o.commission,
      boardedAt: o.boarded ? new Date() : null,
      ...(payment === 'NONE'
        ? {}
        : {
            payment: {
              create: {
                amount: o.price,
                method: source === 'COUNTER' ? 'CASH' : 'TELEBIRR',
                status: payment,
                chapaRef: source === 'ONLINE' ? `${tag}-chapa-${n}` : null,
                refundedAt: o.refunded ? new Date() : null,
              },
            },
          }),
    },
  })
}

const earnings = async (companyId: string) => (await api('GET', `/api/v1/admin/operators/${companyId}/earnings`, admin.tok)).body.data
const pay = (companyId: string, body: Record<string, unknown>) => api('POST', `/api/v1/admin/operators/${companyId}/payouts`, admin.tok, body)

let A: Company, B: Company
let bPast1: any, bPast2: any, bFuture: any, bLost: any, bPending: any, bCounter: any
let firstPayoutId = ''

describe.skipIf(!TEST_URL)('payouts and refunds (database, real routes)', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    const app = express()
    app.use(express.json())
    app.use('/api/v1/admin', (await import('../src/routes/admin.routes')).default)
    app.use('/api/v1/operator', (await import('../src/routes/operator.routes')).default)
    app.use('/api/v1/checkin', (await import('../src/routes/checkin.routes')).default)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    admin = await makeUser('admin', 'ADMIN')
    customer = await makeUser('passenger', 'CUSTOMER')
    route = await prisma.route.create({ data: { fromCity: `${tag}-From`, toCity: `${tag}-To`, distanceKm: 100, estimatedDurationMin: 120 } })
    created.routes.push(route.id)

    A = await makeCompany('A', { commissionPercent: 5 })
    B = await makeCompany('B', { commissionPercent: 0 }) // a pilot operator
    const tripPast = await makeTrip(A, -48)
    const tripFuture = await makeTrip(A, 48)
    bPast1 = await makeBooking(tripPast, { price: 200, commission: 5, ticketCode: 'T2PAST22' })
    bPast2 = await makeBooking(tripPast, { price: 150, commission: null }) // older booking: no frozen rate
    bFuture = await makeBooking(tripFuture, { price: 300, commission: 5 })
    // None of these earn money for the company:
    bCounter = await makeBooking(tripPast, { price: 500, source: 'COUNTER', commission: null })
    bPending = await makeBooking(tripFuture, { price: 100, status: 'PENDING', payment: 'PENDING' })
    bLost = await makeBooking(tripPast, { price: 100, status: 'CANCELLED', payment: 'SUCCESS' }) // paid, seat lost: refund needed
    await makeBooking(tripPast, { price: 120, status: 'CANCELLED', payment: 'SUCCESS', refunded: true }) // already refunded
    // Paid back but still marked confirmed (a second safety net: a refund must never earn the company money)
    await makeBooking(tripPast, { price: 80, status: 'CONFIRMED', payment: 'SUCCESS', refunded: true, commission: 5 })

    const tripB = await makeTrip(B, -24)
    await makeBooking(tripB, { price: 400, commission: 0 })
  })

  afterAll(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
    if (prisma) {
      const ops = [...created.operators]
      const buses = await prisma.bus.findMany({ where: { operatorId: { in: ops } }, select: { id: true } })
      const trips = await prisma.schedule.findMany({ where: { busId: { in: buses.map((b) => b.id) } }, select: { id: true } })
      const tripIds = trips.map((t) => t.id)
      await prisma.payout.deleteMany({ where: { operatorId: { in: ops } } })
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

  it('lets only the platform admin use the money routes', async () => {
    const calls: [string, string, unknown?][] = [
      ['GET', '/api/v1/admin/payouts'],
      ['GET', `/api/v1/admin/operators/${A.operator.id}/earnings`],
      ['POST', `/api/v1/admin/operators/${A.operator.id}/payouts`, { amount: 1, method: 'CASH' }],
      ['POST', '/api/v1/admin/payouts/anything/void', { reason: 'no' }],
      ['POST', `/api/v1/admin/bookings/${bLost.id}/refund`, {}],
    ]
    const fakeAdmin = token(customer.user.id, 'ADMIN') // says ADMIN, is not one in the database
    for (const [m, p, b] of calls) {
      expect((await api(m, p, undefined, b)).status, `${m} ${p} no token`).toBe(401)
      for (const who of [customer.tok, A.manager.tok, A.seller.tok, A.checker.tok, fakeAdmin]) {
        expect((await api(m, p, who, b)).status, `${m} ${p}`).toBe(403)
      }
    }
    // Nothing was changed by those attempts
    expect(await prisma.payout.count({ where: { operatorId: A.operator.id } })).toBe(0)
    expect((await prisma.payment.findFirstOrThrow({ where: { bookingId: bLost.id } })).refundedAt).toBeNull()
  })

  it('counts only paid, confirmed online bookings, and splits what has left from what has not', async () => {
    const e = await earnings(A.operator.id)
    // 200 + 150 + 300 online and confirmed. Counter sale, unpaid hold, lost seat and refunded one are left out.
    expect(e.summary).toMatchObject({ tickets: 3, gross: 650, commission: 32.5, net: 617.5, available: 332.5, pending: 285, paid: 0, due: 332.5, overpaid: 0 })
    expect(e.company.commissionPercent).toBe(5)
    expect(e.trips).toHaveLength(2)
    expect(new Date(e.trips[0].departureTime).getTime()).toBeGreaterThan(new Date(e.trips[1].departureTime).getTime()) // newest first
    const past = e.trips.find((t: any) => t.departed)
    expect(past).toMatchObject({ tickets: 2, seats: 2, gross: 350, commission: 17.5, net: 332.5 })
    expect(e.trips.find((t: any) => !t.departed)).toMatchObject({ tickets: 1, gross: 300, net: 285 })
  })

  it("keeps a booking's rate when the company's commission changes later", async () => {
    await prisma.operator.update({ where: { id: A.operator.id }, data: { commissionPercent: 20 } })
    // Frozen at 5%: 10 and 15. The older booking has no frozen rate, so it follows the new 20%: 30.
    expect((await earnings(A.operator.id)).summary.commission).toBe(55)
    await prisma.operator.update({ where: { id: A.operator.id }, data: { commissionPercent: 5 } })
    expect((await earnings(A.operator.id)).summary.commission).toBe(32.5)
  })

  it('takes no commission from a pilot company set to 0%', async () => {
    expect((await earnings(B.operator.id)).summary).toMatchObject({ gross: 400, commission: 0, net: 400, due: 400 })
  })

  it('refuses a payout of more than is due, and malformed ones', async () => {
    const tooMuch = await pay(A.operator.id, { amount: 400, method: 'TELEBIRR', reference: `${tag}-big` })
    expect(tooMuch.status).toBe(409)
    expect(tooMuch.body.error).toContain('332.50')
    // Sales from trips that have not left yet cannot be paid out: 617.50 earned, only 332.50 due
    expect((await pay(A.operator.id, { amount: 600, method: 'TELEBIRR', reference: `${tag}-pending` })).status).toBe(409)

    for (const amount of [0, -5, 10.123, 'abc', null]) {
      expect((await pay(A.operator.id, { amount, method: 'CASH' })).status, `amount ${amount}`).toBe(400)
    }
    expect((await pay(A.operator.id, { amount: 10, method: 'TELEBIRR' })).status).toBe(400) // transfer without a receipt number
    expect((await pay(A.operator.id, { amount: 10, method: 'WIRE', reference: 'x1234' })).status).toBe(400)
    const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
    expect((await pay(A.operator.id, { amount: 10, method: 'CASH', paidAt: future })).status).toBe(400)
    expect((await pay('does-not-exist', { amount: 10, method: 'CASH' })).status).toBe(404)
    expect(await prisma.payout.count({ where: { operatorId: A.operator.id } })).toBe(0)
  })

  it('records a payout and lowers what is due, for the admin and for the company', async () => {
    const out = await pay(A.operator.id, { amount: 100, method: 'TELEBIRR', reference: `${tag}-TB1`, note: 'First payout' })
    expect(out.status).toBe(201)
    firstPayoutId = out.body.data.payout.id
    expect(out.body.data.payout.createdByUserId).toBeUndefined()

    const e = await earnings(A.operator.id)
    expect(e.summary).toMatchObject({ paid: 100, due: 232.5 })
    expect(e.payouts).toHaveLength(1)
    expect(e.payouts[0]).toMatchObject({ amount: 100, method: 'TELEBIRR', note: 'First payout', voided: false })

    const overview = (await api('GET', '/api/v1/admin/payouts', admin.tok)).body.data
    expect(overview.companies.find((c: any) => c.id === A.operator.id)).toMatchObject({ paid: 100, due: 232.5, commissionPercent: 5 })

    const mine = (await api('GET', '/api/v1/operator/earnings', A.manager.tok)).body.data
    expect(mine.summary).toMatchObject({ paid: 100, due: 232.5 })
  })

  it('does not accept the same receipt twice for one method', async () => {
    expect((await pay(A.operator.id, { amount: 10, method: 'TELEBIRR', reference: `${tag}-TB1` })).status).toBe(409)
    // The same number on a different method is a different receipt
    expect((await pay(A.operator.id, { amount: 10, method: 'CBE_BIRR', reference: `${tag}-TB1` })).status).toBe(201)
    expect((await earnings(A.operator.id)).summary.due).toBe(222.5)
  })

  it('lets cash be paid out without a receipt number', async () => {
    expect((await pay(A.operator.id, { amount: 22.5, method: 'CASH' })).status).toBe(201)
    expect((await earnings(A.operator.id)).summary.due).toBe(200)
  })

  it('never pays more than is due, even when two payouts arrive at the same moment', async () => {
    const [x, y] = await Promise.all([
      pay(A.operator.id, { amount: 150, method: 'BANK_TRANSFER', reference: `${tag}-RACE1` }),
      pay(A.operator.id, { amount: 150, method: 'BANK_TRANSFER', reference: `${tag}-RACE2` }),
    ])
    expect([x.status, y.status].sort()).toEqual([201, 409])
    const e = await earnings(A.operator.id)
    expect(e.summary.due).toBe(50)
    expect(e.summary.overpaid).toBe(0)
  })

  it('voids a payout made by mistake: the money is due again and the receipt can be reused', async () => {
    expect((await api('POST', `/api/v1/admin/payouts/${firstPayoutId}/void`, admin.tok, { reason: '' })).status).toBe(400)
    const out = await api('POST', `/api/v1/admin/payouts/${firstPayoutId}/void`, admin.tok, { reason: 'Typed the wrong amount' })
    expect(out.status).toBe(200)
    expect((await api('POST', `/api/v1/admin/payouts/${firstPayoutId}/void`, admin.tok, { reason: 'again' })).status).toBe(409)
    expect((await api('POST', '/api/v1/admin/payouts/does-not-exist/void', admin.tok, { reason: 'No such payout' })).status).toBe(404)

    let e = await earnings(A.operator.id)
    expect(e.summary.due).toBe(150)
    // History is kept: the voided payout is still listed, marked, with its reason
    expect(e.payouts.find((p: any) => p.id === firstPayoutId)).toMatchObject({ voided: true, voidReason: 'Typed the wrong amount', reference: `${tag}-TB1` })

    // The same receipt can now be used for the corrected entry
    expect((await pay(A.operator.id, { amount: 100, method: 'TELEBIRR', reference: `${tag}-TB1` })).status).toBe(201)
    e = await earnings(A.operator.id)
    expect(e.summary.due).toBe(50)
  })

  it('lists a lost paid booking as needing a refund, until the refund is recorded', async () => {
    const before = (await api('GET', '/api/v1/admin/attention', admin.tok)).body.data.items
    expect(before.some((i: any) => i.kind === 'REFUND_NEEDED' && i.bookingId === bLost.id)).toBe(true)

    const out = await api('POST', `/api/v1/admin/bookings/${bLost.id}/refund`, admin.tok, { reference: `${tag}-RF1`, note: 'Sent back through Telebirr' })
    expect(out.status).toBe(200)
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: bLost.id } })
    expect(payment).toMatchObject({ refundReference: `${tag}-RF1`, refundNote: 'Sent back through Telebirr', refundedByUserId: admin.user.id })
    expect(payment.refundedAt).not.toBeNull()

    const after = (await api('GET', '/api/v1/admin/attention', admin.tok)).body.data.items
    expect(after.some((i: any) => i.kind === 'REFUND_NEEDED' && i.bookingId === bLost.id)).toBe(false)
    expect((await api('POST', `/api/v1/admin/bookings/${bLost.id}/refund`, admin.tok, {})).status).toBe(409) // not twice
  })

  it('refuses refunds that make no sense', async () => {
    expect((await api('POST', `/api/v1/admin/bookings/${bCounter.id}/refund`, admin.tok, {})).status).toBe(409) // counter sale
    expect((await api('POST', `/api/v1/admin/bookings/${bPending.id}/refund`, admin.tok, {})).status).toBe(409) // nothing was paid
    expect((await api('POST', '/api/v1/admin/bookings/does-not-exist/refund', admin.tok, {})).status).toBe(404)
    const trip = await makeTrip(A, -6)
    const boarded = await makeBooking(trip, { price: 90, commission: 5, boarded: true })
    expect((await api('POST', `/api/v1/admin/bookings/${boarded.id}/refund`, admin.tok, {})).status).toBe(409) // already on the bus
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: boarded.id } })).status).toBe('CONFIRMED')
    await prisma.booking.update({ where: { id: boarded.id }, data: { status: 'CANCELLED' } }) // keep later numbers simple
  })

  it('takes a refunded sale out of earnings, voids its ticket, and shows an overpayment instead of hiding it', async () => {
    const before = await earnings(A.operator.id)
    expect(before.summary.paid).toBe(282.5) // 10 + 22.5 + 150 + 100
    // bPast1 (200, frozen 5%) was already paid for. Refund it.
    const out = await api('POST', `/api/v1/admin/bookings/${bPast1.id}/refund`, admin.tok, { note: 'Bus did not run' })
    expect(out.status).toBe(200)
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bPast1.id } })
    expect(booking.status).toBe('CANCELLED') // can no longer board, and its seat is free again

    const e = await earnings(A.operator.id)
    expect(e.summary).toMatchObject({ tickets: 2, gross: 450, commission: 22.5, available: 142.5, pending: 285 })
    // 282.50 has been paid but only 142.50 is now earned: the company owes 140.00 back, nothing is due
    expect(e.summary).toMatchObject({ due: 0, overpaid: 140 })
    const blocked = await pay(A.operator.id, { amount: 1, method: 'CASH' })
    expect(blocked.status).toBe(409)
    expect(blocked.body.error).toContain('Nothing is due')

    // The ticket is refused at the door
    const lookup = await api('GET', '/api/v1/checkin/lookup/T2PAST22', A.checker.tok)
    expect(lookup.status).toBe(200)
    expect(lookup.body.data.state).toBe('VOIDED')
  })

  it("shows a company only its own earnings, and keeps the platform's internal details out", async () => {
    const mineA = (await api('GET', '/api/v1/operator/earnings', A.manager.tok)).body.data
    const mineB = (await api('GET', '/api/v1/operator/earnings', B.manager.tok)).body.data
    expect(mineA.company.id).toBe(A.operator.id)
    expect(mineB.company.id).toBe(B.operator.id)
    expect(mineB.summary).toMatchObject({ gross: 400, due: 400, paid: 0 })
    expect(mineB.payouts).toHaveLength(0)
    expect(mineB.trips.every((t: any) => t.gross === 400)).toBe(true)

    const text = JSON.stringify(mineA)
    for (const secret of ['createdByUserId', 'voidedByUserId', 'refundedByUserId', admin.user.id, 'notes']) {
      expect(text, secret).not.toContain(secret)
    }
    // Only managers: sellers, checkers and passengers are refused
    for (const who of [A.seller.tok, A.checker.tok, customer.tok]) {
      expect((await api('GET', '/api/v1/operator/earnings', who)).status).toBe(403)
    }
    expect((await api('GET', '/api/v1/operator/earnings')).status).toBe(401)
  })

  it("lists every company's balance for the admin, without demo companies in the totals", async () => {
    const demo = await makeCompany('Demo', { isDemo: true, commissionPercent: 5 })
    const tripDemo = await makeTrip(demo, -24)
    await makeBooking(tripDemo, { price: 1000, commission: 5 })

    const out = (await api('GET', '/api/v1/admin/payouts', admin.tok)).body.data
    const mine = out.companies.filter((c: any) => [A.operator.id, B.operator.id, demo.operator.id].includes(c.id))
    expect(mine).toHaveLength(3)
    const dues = out.companies.map((c: any) => c.due)
    expect([...dues].sort((a: number, b: number) => b - a)).toEqual(dues) // most due first
    expect(out.companies.find((c: any) => c.id === demo.operator.id)).toMatchObject({ isDemo: true, due: 950 })
    // Totals leave the demo company out
    const expected = out.companies.filter((c: any) => !c.isDemo).reduce((n: number, c: any) => n + c.due, 0)
    expect(Math.round(out.totals.due * 100)).toBe(Math.round(expected * 100))
  })
})
