/**
 * Database tests for the admin "who sold how much" screens: sales per company and
 * the detail of one company, by period. Through the REAL routes over HTTP.
 * Sales are counted after refunds; demo companies are left out; online and counter
 * sales are always kept apart.
 * Only run when TEST_DATABASE_URL is set; refuse to run against DATABASE_URL.
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
const token = (userId: string, role: string) => jwt.sign({ userId, role }, process.env.JWT_SECRET!)
const DAY = 24 * 3_600_000

async function api(path: string, tok?: string) {
  const res = await fetch(`${baseUrl}${path}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any }
}

const created = { users: new Set<string>(), operators: new Set<string>(), routes: [] as string[] }
async function makeUser(label: string, role: 'CUSTOMER' | 'OPERATOR' | 'ADMIN') {
  const user = await prisma.user.create({ data: { name: `${tag} ${label}`, phone: newPhone(), password: 'x', role } })
  created.users.add(user.id)
  return { user, tok: token(user.id, role) }
}

let admin: Awaited<ReturnType<typeof makeUser>>, customer: Awaited<ReturnType<typeof makeUser>>
let route1: any, route2: any
let qr = 0

async function makeCompany(label: string, over: Record<string, unknown> = {}) {
  const operator = await prisma.operator.create({
    data: { companyName: `${tag} ${label}`, licenseNo: `${tag}-${label}`, phone: '0900000000', commissionPercent: 5, ...over },
  })
  created.operators.add(operator.id)
  const manager = await makeUser(`${label} manager`, 'OPERATOR')
  await prisma.operatorStaff.create({ data: { userId: manager.user.id, operatorId: operator.id, role: 'MANAGER' } })
  const bus = await prisma.bus.create({ data: { operatorId: operator.id, plateNumber: `${tag}-${label}`, totalSeats: 40 } })
  const trip = async (routeId: string) => {
    const dep = new Date(Date.now() + 5 * 3_600_000)
    return prisma.schedule.create({ data: { routeId, busId: bus.id, departureTime: dep, arrivalTime: new Date(dep.getTime() + 2 * 3_600_000), price: 100 } })
  }
  const seller = async (name: string) => {
    const u = await makeUser(name, 'OPERATOR')
    const staff = await prisma.operatorStaff.create({ data: { userId: u.user.id, operatorId: operator.id, role: 'SELLER' } })
    return Object.assign(staff, { tok: u.tok })
  }
  const checker = async () => {
    const u = await makeUser('checker', 'OPERATOR')
    await prisma.operatorStaff.create({ data: { userId: u.user.id, operatorId: operator.id, role: 'CHECKER' } })
    return u
  }
  return { operator, manager, bus, trip, seller, checker }
}

interface Sale {
  tripId: string
  price: number
  at: Date
  status?: 'CONFIRMED' | 'CANCELLED'
  source?: 'ONLINE' | 'COUNTER'
  refundPercent?: number
  refundAmount?: number
  paid?: boolean
  method?: 'CASH' | 'TELEBIRR'
  seller?: string
  frozen?: number
}
async function sale(s: Sale) {
  const source = s.source ?? 'ONLINE'
  const b = await prisma.booking.create({
    data: {
      scheduleId: s.tripId, seatNumbers: [String(++qr)], totalPrice: s.price, status: s.status ?? 'CONFIRMED', qrCode: `${tag}-${qr}`,
      source, createdAt: s.at, userId: source === 'ONLINE' ? customer.user.id : null,
      refundPercent: s.refundPercent ?? null, refundAmount: s.refundAmount ?? null,
      commissionPercent: source === 'ONLINE' ? (s.frozen ?? 5) : null, soldByStaffId: s.seller ?? null,
    },
  })
  if (s.paid ?? true) {
    await prisma.payment.create({
      data: { bookingId: b.id, amount: s.price, method: s.method ?? 'TELEBIRR', status: 'SUCCESS' },
    })
  }
  return b
}

let A: Awaited<ReturnType<typeof makeCompany>>, B: Awaited<ReturnType<typeof makeCompany>>
let C: Awaited<ReturnType<typeof makeCompany>>, D: Awaited<ReturnType<typeof makeCompany>>
let sellerOne: any, sellerTwo: any

const rowOf = (data: any, id: string) => data.companies.find((c: any) => c.id === id)

describe.skipIf(!TEST_URL)('admin sales by company (database, real routes)', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    const app = express()
    app.use(express.json())
    app.use('/api/v1/admin', (await import('../src/routes/admin.routes')).default)
    app.use('/api/v1/operator', (await import('../src/routes/operator.routes')).default)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    admin = await makeUser('admin', 'ADMIN')
    customer = await makeUser('customer', 'CUSTOMER')
    route1 = await prisma.route.create({ data: { fromCity: `${tag}-A`, toCity: `${tag}-B`, distanceKm: 100, estimatedDurationMin: 120 } })
    route2 = await prisma.route.create({ data: { fromCity: `${tag}-A`, toCity: `${tag}-C`, distanceKm: 100, estimatedDurationMin: 120 } })
    created.routes.push(route1.id, route2.id)

    A = await makeCompany('A')
    B = await makeCompany('B')
    C = await makeCompany('C')
    D = await makeCompany('Demo', { isDemo: true })
    const now = new Date()
    const t1 = await A.trip(route1.id)
    const t2 = await A.trip(route2.id)
    sellerOne = await A.seller('Seller One')
    sellerTwo = await A.seller('Seller Two')

    // Company A
    await sale({ tripId: t1.id, price: 100, at: now }) //                                    online, kept in full
    await sale({ tripId: t1.id, price: 200, at: new Date(now.getTime() - 3 * DAY) }) //      online, 3 days ago
    await sale({ tripId: t1.id, price: 120, at: now, status: 'CANCELLED', refundPercent: 50, refundAmount: 60 }) // company kept 60
    await sale({ tripId: t1.id, price: 120, at: now, status: 'CANCELLED', refundPercent: 100, refundAmount: 120 }) // fully refunded: no sale
    await sale({ tripId: t1.id, price: 90, at: now, status: 'CANCELLED', paid: false }) //   never paid: no sale
    await sale({ tripId: t1.id, price: 500, at: new Date(now.getTime() - 40 * DAY) }) //     too old for 7d and 30d
    await sale({ tripId: t2.id, price: 40, at: now }) //                                      online, second route
    await sale({ tripId: t1.id, price: 150, at: now, source: 'COUNTER', method: 'CASH', seller: sellerOne.id })
    await sale({ tripId: t1.id, price: 50, at: now, source: 'COUNTER', method: 'TELEBIRR', seller: sellerTwo.id })
    await sale({ tripId: t1.id, price: 80, at: now, source: 'COUNTER', status: 'CANCELLED', method: 'CASH', seller: sellerOne.id }) // voided

    // Company B sells more online; the demo company sells a lot but must never show
    await sale({ tripId: (await B.trip(route1.id)).id, price: 300, at: now })
    await sale({ tripId: (await D.trip(route1.id)).id, price: 1000, at: now })

    // Company C: the exact edges of "today" in Addis time
    const tc = await C.trip(route1.id)
    // Midnight in Addis (UTC+3, no daylight saving), worked out here on its own, not by the code under test
    const [y, m, dd] = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10).split('-').map(Number)
    const startOfToday = new Date(Date.UTC(y, m - 1, dd) - 3 * 3_600_000)
    await sale({ tripId: tc.id, price: 11, at: startOfToday }) //                         first moment of today
    await sale({ tripId: tc.id, price: 22, at: new Date(startOfToday.getTime() - 1) }) // last moment of yesterday
  })

  afterAll(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
    if (prisma) {
      const ops = [...created.operators]
      const buses = await prisma.bus.findMany({ where: { operatorId: { in: ops } }, select: { id: true } })
      const trips = await prisma.schedule.findMany({ where: { busId: { in: buses.map((b) => b.id) } }, select: { id: true } })
      const ids = trips.map((t) => t.id)
      await prisma.payment.deleteMany({ where: { booking: { scheduleId: { in: ids } } } })
      await prisma.booking.deleteMany({ where: { scheduleId: { in: ids } } })
      await prisma.schedule.deleteMany({ where: { id: { in: ids } } })
      await prisma.operatorStaff.deleteMany({ where: { operatorId: { in: ops } } })
      await prisma.bus.deleteMany({ where: { id: { in: buses.map((b) => b.id) } } })
      await prisma.route.deleteMany({ where: { id: { in: created.routes } } })
      await prisma.operator.deleteMany({ where: { id: { in: ops } } })
      await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } })
      await prisma.$disconnect()
    }
  })

  it('is for the platform admin only, checked in the database', async () => {
    for (const p of ['/api/v1/admin/sales', `/api/v1/admin/sales/${A.operator.id}`]) {
      expect((await api(p)).status).toBe(401)
      expect((await api(p, customer.tok)).status).toBe(403)
      expect((await api(p, A.manager.tok)).status).toBe(403)
      expect((await api(p, token(customer.user.id, 'ADMIN'))).status).toBe(403) // a token that only says ADMIN
      expect((await api(p, admin.tok)).status).toBe(200)
    }
  })

  it('shows each company\'s online and counter sales for today, after refunds, with the biggest first', async () => {
    const out = await api('/api/v1/admin/sales?period=today', admin.tok)
    expect(out.status).toBe(200)
    const a = rowOf(out.body.data, A.operator.id)
    // online: 100 + 40 + the 60 kept from the 50% cancellation = 200, and 2 tickets (a kept cancellation is not a ticket)
    expect(a.online).toEqual({ tickets: 2, total: 200 })
    expect(a.counter).toEqual({ tickets: 2, total: 200 }) // 150 cash + 50 Telebirr; the voided 80 is not a sale
    expect(a.total).toBe(400)
    expect(a.commission).toBe(10) // 5% of 200 (online only)

    const b = rowOf(out.body.data, B.operator.id)
    expect(b.online).toEqual({ tickets: 1, total: 300 })
    expect(b.counter).toEqual({ tickets: 0, total: 0 })

    const order = out.body.data.companies.map((c: any) => c.id)
    expect(order.indexOf(A.operator.id)).toBeLessThan(order.indexOf(B.operator.id)) // 400 before 300
    const totals = out.body.data.companies.map((c: any) => c.total)
    expect([...totals].sort((x: number, y: number) => y - x)).toEqual(totals)
  })

  it('leaves demo companies out, and the totals add up to the rows', async () => {
    const out = (await api('/api/v1/admin/sales?period=today', admin.tok)).body.data
    expect(rowOf(out, D.operator.id)).toBeUndefined()
    const sum = (k: 'online' | 'counter') => out.companies.reduce((n: number, c: any) => n + c[k].total, 0)
    expect(out.totals.online.total).toBeCloseTo(sum('online'), 6)
    expect(out.totals.counter.total).toBeCloseTo(sum('counter'), 6)
    expect(out.totals.total).toBeCloseTo(out.totals.online.total + out.totals.counter.total, 6)
    const shares = out.companies.reduce((n: number, c: any) => n + c.share, 0)
    expect(shares).toBeGreaterThan(99.5)
    expect(shares).toBeLessThan(100.5)
  })

  it('counts a sale made in the first moment of today, and not one a millisecond before it', async () => {
    const today = rowOf((await api('/api/v1/admin/sales?period=today', admin.tok)).body.data, C.operator.id)
    expect(today.online).toEqual({ tickets: 1, total: 11 })
    const week = rowOf((await api('/api/v1/admin/sales?period=7d', admin.tok)).body.data, C.operator.id)
    expect(week.online).toEqual({ tickets: 2, total: 33 })
  })

  it('widens with the period: 7 and 30 days include the older sale, and not the 40-day-old one', async () => {
    for (const p of ['7d', '30d']) {
      const a = rowOf((await api(`/api/v1/admin/sales?period=${p}`, admin.tok)).body.data, A.operator.id)
      expect(a.online).toEqual({ tickets: 3, total: 400 }) // 100 + 200 + 40 + 60 kept; the 500 from 40 days ago is out
      expect(a.counter.total).toBe(200)
    }
    const month = (await api('/api/v1/admin/sales?period=month', admin.tok)).body.data
    expect(month.from.endsWith('-01')).toBe(true)
    expect(rowOf(month, A.operator.id).total).toBeGreaterThanOrEqual(400)
  })

  it('rejects an unknown period and an unknown company', async () => {
    expect((await api('/api/v1/admin/sales?period=year', admin.tok)).status).toBe(400)
    expect((await api(`/api/v1/admin/sales/${A.operator.id}?period=bad`, admin.tok)).status).toBe(400)
    expect((await api('/api/v1/admin/sales/not-a-company', admin.tok)).status).toBe(404)
  })

  it('opens one company: by route, by day, by seller and counter payment method', async () => {
    const out = await api(`/api/v1/admin/sales/${A.operator.id}?period=7d`, admin.tok)
    expect(out.status).toBe(200)
    const d = out.body.data
    expect(d.company.companyName).toContain('A')
    expect(d.totals).toMatchObject({ online: { tickets: 3, total: 400 }, counter: { tickets: 2, total: 200 }, total: 600, commission: 20 })

    // Routes: the bigger one first, and the totals match
    expect(d.byRoute.map((r: any) => r.toCity)).toEqual([`${tag}-B`, `${tag}-C`])
    expect(d.byRoute[0]).toMatchObject({ online: { tickets: 2, total: 360 }, counter: { tickets: 2, total: 200 }, total: 560 })
    expect(d.byRoute[1]).toMatchObject({ online: { tickets: 1, total: 40 }, total: 40 })

    // Days: seven of them, including the quiet ones
    expect(d.byDay).toHaveLength(7)
    expect(d.byDay[6].total).toBe(400) // today: 200 online + 200 counter
  })

  it('shows today per day, per seller and per payment method', async () => {
    const d = (await api(`/api/v1/admin/sales/${A.operator.id}?period=7d`, admin.tok)).body.data
    const today = d.byDay[d.byDay.length - 1]
    expect(today.online.total).toBe(200)
    expect(today.counter.total).toBe(200)
    const threeAgo = d.byDay[d.byDay.length - 4]
    expect(threeAgo.online).toEqual({ tickets: 1, total: 200 })
    expect(d.byDay.reduce((n: number, x: any) => n + x.total, 0)).toBe(d.totals.total)

    expect(d.bySeller).toEqual([
      { name: expect.stringContaining('Seller One'), tickets: 1, total: 150 },
      { name: expect.stringContaining('Seller Two'), tickets: 1, total: 50 },
    ])
    expect(d.counterByMethod).toEqual([
      { method: 'CASH', tickets: 1, total: 150 },
      { method: 'TELEBIRR', tickets: 1, total: 50 },
    ])
  })

  it('lets the admin open a demo company by its id, with its own numbers', async () => {
    const d = (await api(`/api/v1/admin/sales/${D.operator.id}?period=today`, admin.tok)).body.data
    expect(d.company.isDemo).toBe(true)
    expect(d.totals.online.total).toBe(1000)
  })

  it('uses the same numbers on the dashboard companies list (30 days, after refunds)', async () => {
    const list = (await api('/api/v1/admin/operators', admin.tok)).body.data.operators
    const a = list.find((o: any) => o.id === A.operator.id)
    expect(a.online30).toEqual({ tickets: 3, total: 400 })
    expect(a.counter30).toEqual({ tickets: 2, total: 200 })
  })
  it('lets a manager see only their own company\'s sales, the same numbers the admin sees for it', async () => {
    const mine = await api('/api/v1/operator/sales?period=7d', A.manager.tok)
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    const asAdmin = (await api(`/api/v1/admin/sales/${A.operator.id}?period=7d`, admin.tok)).body.data
    expect(mine.body.data).toEqual(asAdmin)
    expect(mine.body.data.company.id).toBe(A.operator.id)
    expect(mine.body.data.totals).toMatchObject({ online: { tickets: 3, total: 400 }, counter: { tickets: 2, total: 200 } })

    // Company B's manager gets company B's numbers, never A's
    const theirs = (await api('/api/v1/operator/sales?period=7d', B.manager.tok)).body.data
    expect(theirs.company.id).toBe(B.operator.id)
    expect(theirs.totals.online.total).toBe(300)
    expect(JSON.stringify(theirs)).not.toContain(A.operator.id)
    expect(JSON.stringify(theirs)).not.toContain(`${tag}-C`) // A's second route

    // Asking for another company by id changes nothing: the company comes from who is logged in
    const sneaky = (await api(`/api/v1/operator/sales?period=7d&operatorId=${A.operator.id}`, B.manager.tok)).body.data
    expect(sneaky.company.id).toBe(B.operator.id)
  })

  it('does not let sellers, checkers, customers or strangers open the company sales', async () => {
    const seller = await A.seller('Another Seller')
    const checker = await A.checker()
    expect((await api('/api/v1/operator/sales')).status).toBe(401)
    expect((await api('/api/v1/operator/sales', seller.tok)).status).toBe(403)
    expect((await api('/api/v1/operator/sales', checker.tok)).status).toBe(403)
    expect((await api('/api/v1/operator/sales', customer.tok)).status).toBe(403)
    expect((await api('/api/v1/operator/sales?period=year', A.manager.tok)).status).toBe(400)
    // The platform admin has no company of their own here: they use the admin screens
    expect((await api('/api/v1/operator/sales', admin.tok)).status).toBe(404)
  })
})
