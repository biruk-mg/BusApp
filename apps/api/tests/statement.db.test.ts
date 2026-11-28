/**
 * Database tests for the operator monthly statement and the CSV exports.
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
if (TEST_URL && NORMAL_URL && TEST_URL === NORMAL_URL) throw new Error('TEST_DATABASE_URL is the same as DATABASE_URL. Use a separate database or Neon branch.')
if (TEST_URL) process.env.DATABASE_URL = TEST_URL
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-only-for-tests'

type Prisma = typeof import('../src/lib/prisma').prisma
let prisma: Prisma
let server: http.Server
let baseUrl = ''
let loadStatement: typeof import('../src/lib/statement').loadStatement
let loadEarnings: typeof import('../src/lib/earnings').loadEarnings
let currentMonth: typeof import('../src/lib/statement').currentMonth

const tag = `TEST-${Date.now()}`
let counter = 0
const uniq = () => counter++
const token = (userId: string, role: string) => jwt.sign({ userId, role }, process.env.JWT_SECRET!)

async function api(path: string, tok?: string) {
  const res = await fetch(`${baseUrl}${path}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
  // Read the raw bytes: fetch's own text() silently drops the byte-order mark that the tests check for
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer())
  let body: any = {}
  try { body = JSON.parse(text) } catch { /* a CSV */ }
  return { status: res.status, body, text, headers: res.headers }
}

const created = { users: new Set<string>(), operators: new Set<string>(), routes: [] as string[] }
type Company = Awaited<ReturnType<typeof makeCompany>>

async function makeUser(label: string, role: 'CUSTOMER' | 'OPERATOR' = 'OPERATOR') {
  const user = await prisma.user.create({ data: { name: `${tag} ${label}`, phone: `09${String((Date.now() % 1000000) * 100 + uniq()).padStart(8, '0').slice(-8)}`, password: 'x', role } })
  created.users.add(user.id)
  return { user, tok: token(user.id, role) }
}
async function makeCompany(label: string) {
  const operator = await prisma.operator.create({ data: { companyName: `${tag} ${label}`, licenseNo: `${tag}-${label}-${uniq()}`, phone: '0900000000', commissionPercent: 5 } })
  created.operators.add(operator.id)
  const staff = async (role: 'MANAGER' | 'SELLER' | 'CHECKER') => {
    const u = await makeUser(`${label} ${role}`)
    await prisma.operatorStaff.create({ data: { userId: u.user.id, operatorId: operator.id, role } })
    return u
  }
  const manager = await staff('MANAGER')
  const seller = await staff('SELLER')
  const checker = await staff('CHECKER')
  const bus = await prisma.bus.create({ data: { operatorId: operator.id, plateNumber: `${tag}-${label}-${uniq()}`, totalSeats: 40 } })
  const route = await prisma.route.create({ data: { fromCity: `${tag}-${label}-From`, toCity: `${tag}-${label}-To`, distanceKm: 100, estimatedDurationMin: 120 } })
  created.routes.push(route.id)
  return { operator, manager, seller, checker, bus, route }
}

const trip = (c: Company, departure: string | Date) => {
  const dep = new Date(departure)
  return prisma.schedule.create({ data: { routeId: c.route.id, busId: c.bus.id, departureTime: dep, arrivalTime: new Date(dep.getTime() + 2 * 3600_000), price: 100 } })
}

type Kind = 'ONLINE' | 'PARTIAL_REFUND' | 'FULL_REFUND' | 'COUNTER' | 'COUNTER_VOID'
async function ticket(c: Company, scheduleId: string, kind: Kind, total: number, opts: { createdAt?: Date; frozenPercent?: number | null; phone?: string; method?: 'TELEBIRR' | 'CASH' } = {}) {
  const online = !kind.startsWith('COUNTER')
  const n = uniq()
  const refund = kind === 'PARTIAL_REFUND' ? total / 2 : kind === 'FULL_REFUND' ? total : null
  return prisma.booking.create({
    data: {
      scheduleId,
      seatNumbers: [String(n)],
      totalPrice: total,
      source: online ? 'ONLINE' : 'COUNTER',
      status: kind === 'PARTIAL_REFUND' || kind === 'FULL_REFUND' || kind === 'COUNTER_VOID' ? 'CANCELLED' : 'CONFIRMED',
      qrCode: `${tag}-qr-${n}`,
      ticketCode: `${tag}-T${n}`,
      commissionPercent: online ? (opts.frozenPercent === undefined ? 5 : opts.frozenPercent) : null,
      refundPercent: kind === 'PARTIAL_REFUND' ? 50 : kind === 'FULL_REFUND' ? 100 : null,
      refundAmount: refund,
      passengerPhone: opts.phone ?? null,
      soldByStaffId: online ? null : (await prisma.operatorStaff.findFirst({ where: { userId: c.seller.user.id } }))!.id,
      createdAt: opts.createdAt,
      userId: online ? (await makeUser(`buyer${n}`, 'CUSTOMER')).user.id : null,
      payment: { create: { amount: total, method: online ? 'TELEBIRR' : (opts.method ?? 'CASH'), status: 'SUCCESS', refundedAt: kind === 'FULL_REFUND' ? new Date() : null } },
    },
  })
}

const payout = (c: Company, amount: number, paidAt: string, extra: { voided?: boolean; note?: string; ref?: string } = {}) =>
  prisma.payout.create({
    data: {
      operatorId: c.operator.id, amount, method: 'TELEBIRR', reference: extra.voided ? null : (extra.ref ?? `${tag}-R${uniq()}`),
      voidedReference: extra.voided ? `${tag}-V${uniq()}` : null, note: extra.note, paidAt: new Date(paidAt), createdByUserId: c.manager.user.id,
      voidedAt: extra.voided ? new Date() : null, voidReason: extra.voided ? 'entered twice' : null,
    },
  })

// A month counter relative to the real month, for the tests that go through the routes
const monthOffset = (k: number): string => {
  const [y, m] = currentMonth().split('-').map(Number)
  const index = y * 12 + (m - 1) + k
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}
const midMonth = (month: string) => `${month}-10T09:00:00Z` // 12:00 on the 10th in Addis

describe.skipIf(!TEST_URL)('operator statement and exports (database)', () => {
  let A: Company
  let B: Company

  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    ;({ loadStatement, currentMonth } = await import('../src/lib/statement'))
    ;({ loadEarnings } = await import('../src/lib/earnings'))
    const app = express()
    app.use(express.json())
    app.use('/api/v1/operator', (await import('../src/routes/operator.routes')).default)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    A = await makeCompany('A')
    B = await makeCompany('B')
  })

  afterAll(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
    if (prisma) {
      const ops = [...created.operators]
      const buses = await prisma.bus.findMany({ where: { operatorId: { in: ops } }, select: { id: true } })
      const trips = await prisma.schedule.findMany({ where: { busId: { in: buses.map((b) => b.id) } }, select: { id: true } })
      const bookings = await prisma.booking.findMany({ where: { scheduleId: { in: trips.map((t) => t.id) } }, select: { id: true } })
      await prisma.payment.deleteMany({ where: { bookingId: { in: bookings.map((b) => b.id) } } })
      await prisma.booking.deleteMany({ where: { id: { in: bookings.map((b) => b.id) } } })
      await prisma.schedule.deleteMany({ where: { id: { in: trips.map((t) => t.id) } } })
      await prisma.payout.deleteMany({ where: { operatorId: { in: ops } } })
      await prisma.bus.deleteMany({ where: { id: { in: buses.map((b) => b.id) } } })
      await prisma.route.deleteMany({ where: { id: { in: created.routes } } })
      await prisma.operatorStaff.deleteMany({ where: { operatorId: { in: ops } } })
      await prisma.operator.deleteMany({ where: { id: { in: ops } } })
      await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } })
      await prisma.$disconnect()
    }
  })

  describe('the numbers (fixed clock)', () => {
    const NOW = new Date('2026-12-20T09:00:00Z')
    let C: Company

    it('adds up a month: value, refunds, commission, net, payouts, and what is still owed', async () => {
      C = await makeCompany('C')
      const sep = await trip(C, '2026-09-10T09:00:00Z')
      const oct = await trip(C, '2026-10-10T09:00:00Z')
      await ticket(C, sep.id, 'ONLINE', 1000)
      await ticket(C, sep.id, 'ONLINE', 500)
      await payout(C, 500, '2026-09-25T09:00:00Z')
      await payout(C, 100, '2026-09-26T09:00:00Z', { voided: true })
      await ticket(C, oct.id, 'ONLINE', 1000)
      await ticket(C, oct.id, 'PARTIAL_REFUND', 400) // kept 200
      await ticket(C, oct.id, 'FULL_REFUND', 300)
      await ticket(C, oct.id, 'COUNTER', 330)
      await ticket(C, oct.id, 'COUNTER_VOID', 330)

      const s = (await loadStatement(C.operator.id, '2026-09', undefined, NOW))!
      expect(s.openingBalance).toBe(0)
      expect(s.online).toMatchObject({ tickets: 2, ticketValue: 1500, refunded: 0, earned: 1500, commission: 75, net: 1425 })
      expect(s.payouts.total).toBe(500)
      expect(s.payouts.voided).toHaveLength(1) // shown, not counted
      expect(s.closingBalance).toBe(925)

      const o = (await loadStatement(C.operator.id, '2026-10', undefined, NOW))!
      expect(o.openingBalance).toBe(925) // last month's closing balance
      expect(o.online).toMatchObject({ tickets: 1, seats: 1, ticketValue: 1400, refunded: 200, earned: 1200, commission: 60, net: 1140 })
      expect(o.fullRefunds).toEqual({ tickets: 1, amount: 300 })
      expect(o.closingBalance).toBe(2065)
      // Counter money is information only
      expect(o.counter).toMatchObject({ tickets: 1, seats: 1, total: 330, voided: { tickets: 1, total: 330 } })
      expect(o.counter.byMethod).toEqual([{ method: 'CASH', tickets: 1, seats: 1, total: 330 }])
      // The trip line adds up to the month
      expect(o.trips).toHaveLength(1)
      expect(o.trips[0]).toMatchObject({ tickets: 1, ticketValue: 1400, refunded: 200, earned: 1200, commission: 60, net: 1140 })
    })

    it('the closing balance of one month is the opening balance of the next', async () => {
      const [sep, oct, nov] = await Promise.all(['2026-09', '2026-10', '2026-11'].map((m) => loadStatement(C.operator.id, m, undefined, NOW)))
      expect(oct!.openingBalance).toBe(sep!.closingBalance)
      expect(nov!.openingBalance).toBe(oct!.closingBalance)
      expect(nov!.closingBalance).toBe(oct!.closingBalance) // nothing happened in November
    })

    it('uses the commission rate frozen on each ticket, not today\'s rate', async () => {
      const D = await makeCompany('D')
      const t = await trip(D, '2026-10-10T09:00:00Z')
      await ticket(D, t.id, 'ONLINE', 1000, { frozenPercent: 10 })
      await ticket(D, t.id, 'ONLINE', 1000, { frozenPercent: null }) // older ticket: falls back to the company's 5%
      const s = (await loadStatement(D.operator.id, '2026-10', undefined, NOW))!
      expect(s.online.commission).toBe(100 + 50)
    })

    it('a trip belongs to the month it departs in Addis time (UTC+3), not in UTC', async () => {
      const E = await makeCompany('E')
      const lastOfSep = await trip(E, '2026-09-30T20:59:59Z') // 23:59:59 on 30 Sep in Addis
      const firstOfOct = await trip(E, '2026-09-30T21:00:00Z') // 00:00:00 on 1 Oct in Addis
      const lastOfOct = await trip(E, '2026-10-31T20:59:59Z')
      const firstOfNov = await trip(E, '2026-10-31T21:00:00Z')
      for (const t of [lastOfSep, firstOfOct, lastOfOct, firstOfNov]) await ticket(E, t.id, 'ONLINE', 100)
      const sep = (await loadStatement(E.operator.id, '2026-09', undefined, NOW))!
      const oct = (await loadStatement(E.operator.id, '2026-10', undefined, NOW))!
      const nov = (await loadStatement(E.operator.id, '2026-11', undefined, NOW))!
      expect([sep.online.tickets, oct.online.tickets, nov.online.tickets]).toEqual([1, 2, 1])
    })

    it('a month still in progress counts only trips that have left; the rest is "still to depart"', async () => {
      const F = await makeCompany('F')
      const left = await trip(F, '2026-12-05T09:00:00Z')
      const later = await trip(F, '2026-12-28T09:00:00Z')
      await ticket(F, left.id, 'ONLINE', 1000)
      await ticket(F, later.id, 'ONLINE', 2000)
      const s = (await loadStatement(F.operator.id, '2026-12', undefined, NOW))!
      expect(s.inProgress).toBe(true)
      expect(s.online.earned).toBe(1000)
      expect(s.stillToDepart.net).toBe(1900)
      expect(s.closingBalance).toBe(950) // the second trip is not counted yet
      expect((await loadStatement(F.operator.id, '2026-12', undefined, new Date('2027-02-01T09:00:00Z')))!.inProgress).toBe(false)
    })

    it('a payout dated in a later month is not in this month', async () => {
      const G = await makeCompany('G')
      const t = await trip(G, '2026-10-10T09:00:00Z')
      await ticket(G, t.id, 'ONLINE', 1000)
      await payout(G, 400, '2026-11-02T09:00:00Z')
      expect((await loadStatement(G.operator.id, '2026-10', undefined, NOW))!.closingBalance).toBe(950)
      expect((await loadStatement(G.operator.id, '2026-11', undefined, NOW))!.closingBalance).toBe(550)
    })

    it('does not mix up companies', async () => {
      const s = (await loadStatement(A.operator.id, '2026-10', undefined, NOW))!
      expect(s.online.tickets).toBe(0)
      expect(s.trips).toEqual([])
    })
  })

  describe('agrees with the Earnings page', () => {
    it('this month\'s closing balance equals what the Earnings page says is due', async () => {
      const H = await makeCompany('H')
      const m2 = monthOffset(-2)
      const m1 = monthOffset(-1)
      const t2 = await trip(H, midMonth(m2))
      const t1 = await trip(H, midMonth(m1))
      await ticket(H, t2.id, 'ONLINE', 1000)
      await ticket(H, t1.id, 'ONLINE', 700)
      await ticket(H, t1.id, 'PARTIAL_REFUND', 600)
      await payout(H, 300, `${m1}-20T09:00:00Z`)
      const earnings = (await loadEarnings(H.operator.id))!
      const now = (await loadStatement(H.operator.id, currentMonth()))!
      expect(now.closingBalance).toBe(earnings.shaped.due)
      expect(earnings.shaped.overpaid).toBe(0)
      // and the statement of the previous month closes at the same figure when nothing happened since
      expect((await loadStatement(H.operator.id, m1))!.closingBalance).toBe(now.closingBalance)
    })
  })

  describe('the routes', () => {
    it('need a login, and a manager of a company (not a seller, a checker or a customer)', async () => {
      expect((await api('/api/v1/operator/statement')).status).toBe(401)
      expect((await api('/api/v1/operator/statement', A.seller.tok)).status).toBe(403)
      expect((await api('/api/v1/operator/statement', A.checker.tok)).status).toBe(403)
      const customer = await makeUser('Customer', 'CUSTOMER')
      expect((await api('/api/v1/operator/statement', customer.tok)).status).toBe(403)
      expect((await api('/api/v1/operator/statement.csv', A.seller.tok)).status).toBe(403)
      expect((await api('/api/v1/operator/exports/sales.csv', A.checker.tok)).status).toBe(403)
      expect((await api('/api/v1/operator/statement', A.manager.tok)).status).toBe(200)
    })

    it('shows a company only its own money, whatever is asked', async () => {
      const m1 = monthOffset(-1)
      const tA = await trip(A, midMonth(m1))
      const tB = await trip(B, midMonth(m1))
      await ticket(A, tA.id, 'ONLINE', 1000)
      await ticket(B, tB.id, 'ONLINE', 7777)
      const a = await api(`/api/v1/operator/statement?month=${m1}`, A.manager.tok)
      const b = await api(`/api/v1/operator/statement?month=${m1}&operatorId=${A.operator.id}&companyId=${A.operator.id}`, B.manager.tok)
      expect(a.body.data.company.id).toBe(A.operator.id)
      expect(a.body.data.online.ticketValue).toBe(1000)
      expect(b.body.data.company.id).toBe(B.operator.id)
      expect(b.body.data.online.ticketValue).toBe(7777)
      expect(JSON.stringify(a.body)).not.toContain('7777')
      expect(a.headers.get('cache-control')).toBe('no-store')
    })

    it('refuses a month that is not a month, or has not started', async () => {
      for (const bad of ['2026-13', '2026-1', 'abc', '2026-11-05', '']) {
        expect((await api(`/api/v1/operator/statement?month=${encodeURIComponent(bad)}`, A.manager.tok)).status, bad).toBe(400)
      }
      expect((await api(`/api/v1/operator/statement?month=${monthOffset(1)}`, A.manager.tok)).status).toBe(400)
      expect((await api('/api/v1/operator/statement', A.manager.tok)).body.data.month).toBe(currentMonth()) // default
    })

    it('the statement CSV is a spreadsheet-ready file with every section', async () => {
      const m1 = monthOffset(-1)
      const res = await api(`/api/v1/operator/statement.csv?month=${m1}`, A.manager.tok)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/csv')
      expect(res.headers.get('content-disposition')).toMatch(new RegExp(`^attachment; filename="mugobus-statement-[a-z0-9-]+-${m1}\\.csv"$`))
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(res.text.startsWith('\uFEFF')).toBe(true)
      for (const part of ['MugoBus operator statement', 'Opening balance', 'Platform commission', 'Closing balance', 'Trips', 'Payouts', 'Counter sales']) expect(res.text).toContain(part)
      expect(res.text).toContain('1000.00')
    })

    it('a payout note typed by someone cannot become a spreadsheet formula', async () => {
      const m1 = monthOffset(-1)
      await payout(B, 50, `${m1}-15T09:00:00Z`, { note: '=HYPERLINK("http://evil.example","click")' })
      const res = await api(`/api/v1/operator/statement.csv?month=${m1}`, B.manager.tok)
      expect(res.text).toContain(`'=HYPERLINK`)
      expect(res.text).not.toMatch(/(^|,|\r\n)=HYPERLINK/)
    })
  })

  describe('the sales export', () => {
    it('lists every ticket sold in the range, by Addis sale date, with the money worked out', async () => {
      const K = await makeCompany('K')
      const t = await trip(K, '2026-10-20T09:00:00Z')
      await ticket(K, t.id, 'ONLINE', 1000, { createdAt: new Date('2026-10-05T09:00:00Z') })
      await ticket(K, t.id, 'PARTIAL_REFUND', 400, { createdAt: new Date('2026-10-06T09:00:00Z') })
      await ticket(K, t.id, 'COUNTER', 330, { createdAt: new Date('2026-10-07T09:00:00Z'), phone: '0911223344' })
      await ticket(K, t.id, 'COUNTER_VOID', 330, { createdAt: new Date('2026-10-07T10:00:00Z') })
      await ticket(K, t.id, 'ONLINE', 999, { createdAt: new Date('2026-09-30T20:59:00Z') }) // 23:59 on 30 Sep in Addis: before the range
      await ticket(K, t.id, 'ONLINE', 888, { createdAt: new Date('2026-09-30T21:01:00Z') }) // 00:01 on 1 Oct in Addis: inside
      await prisma.booking.create({ data: { scheduleId: t.id, seatNumbers: ['39'], totalPrice: 555, source: 'ONLINE', status: 'CANCELLED', qrCode: `${tag}-hold`, createdAt: new Date('2026-10-08T09:00:00Z') } }) // an unpaid hold that expired

      const res = await api('/api/v1/operator/exports/sales.csv?from=2026-10-01&to=2026-10-31', K.manager.tok)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-disposition')).toContain('-2026-10-01-to-2026-10-31.csv')
      const lines = res.text.replace('\uFEFF', '').trim().split('\r\n')
      expect(lines[0].startsWith('Sale date,Sale time,Ticket code,Channel,Status')).toBe(true)
      expect(lines).toHaveLength(1 + 5) // the 999 ticket and the unpaid hold are not in it
      const text = lines.join('\n')
      expect(text).toContain(',Online,Sold,') // 1000: commission 50.00, net 950.00
      expect(text).toMatch(/1000\.00,0\.00,1000\.00,5%,50\.00,950\.00/)
      expect(text).toMatch(/400\.00,200\.00,200\.00,5%,10\.00,190\.00/) // partial refund: kept 200
      expect(text).toMatch(/,Counter,Sold,.*330\.00,0\.00,330\.00,,0\.00,330\.00,CASH/)
      expect(text).toMatch(/,Counter,Voided,.*330\.00,0\.00,0\.00,,0\.00,0\.00,CASH/)
      expect(text).toContain('888.00')
      expect(text).not.toContain('999.00')
      expect(text).not.toContain('555.00')
      // No phone numbers or buyer names in an accounting export
      expect(text).not.toContain('0911223344')
    })

    it('checks the dates', async () => {
      const bad = async (q: string) => (await api(`/api/v1/operator/exports/sales.csv?${q}`, A.manager.tok)).status
      expect(await bad('from=2026-10-31&to=2026-10-01')).toBe(400)
      expect(await bad('from=2026-13-01&to=2026-14-01')).toBe(400)
      expect(await bad('from=abc&to=2026-10-01')).toBe(400)
      expect(await bad('from=2025-01-01&to=2026-12-31')).toBe(400) // more than 366 days
      expect(await bad('from=2026-01-01&to=2026-12-31')).toBe(200) // exactly 365 days
      expect(await bad('')).toBe(200) // default: this month so far
    })

    it('only exports the logged-in company\'s tickets', async () => {
      const m1 = monthOffset(-1)
      const res = await api(`/api/v1/operator/exports/sales.csv?from=${m1}-01&to=${m1}-28`, A.manager.tok)
      expect(res.text).not.toContain('7777.00')
    })
  })
})
