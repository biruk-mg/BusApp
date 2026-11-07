/**
 * Database tests for staff roles and permissions (Patch C1).
 *
 * These go through the REAL routers, middleware and controllers over HTTP, because
 * the wiring (route -> permission check -> controller) is exactly what must be right.
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
let staffCtl: typeof import('../src/controllers/staff.controller')
let templateCtl: typeof import('../src/controllers/template.controller')

const tag = `TEST-${Date.now()}`
const created = { users: new Set<string>(), operators: [] as string[], buses: [] as string[], routes: [] as string[] }
let phoneCounter = 0
// A valid Ethiopian number the API accepts: 09 + 8 digits (unique per run and per call)
const newPhone = () => `09${String((Date.now() % 1000000) * 100 + phoneCounter++).padStart(8, '0').slice(-8)}`

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

let operatorA: any, operatorB: any
let managerA: any, managerB: any, legacyOperator: any, customer: any, admin: any
let tokManagerA: string, tokManagerB: string, tokCustomer: string, tokAdmin: string
let busA: any, busB: any, route: any, tripA: any
let seller: any, checker: any, tokSeller: string, tokChecker: string

async function makeUser(label: string, role: 'CUSTOMER' | 'OPERATOR' | 'ADMIN', phone = newPhone()) {
  const user = await prisma.user.create({ data: { name: `${tag} ${label}`, phone, password: 'x', role } })
  created.users.add(user.id)
  return user
}

describe.skipIf(!TEST_URL)('staff roles and permissions (database, real routes)', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    staffCtl = await import('../src/controllers/staff.controller')
    templateCtl = await import('../src/controllers/template.controller')
    const operatorRoutes = (await import('../src/routes/operator.routes')).default
    const scheduleRoutes = (await import('../src/routes/schedule.routes')).default
    const authRoutes = (await import('../src/routes/auth.routes')).default

    const app = express()
    app.use(express.json())
    app.use('/api/v1/auth', authRoutes)
    app.use('/api/v1/operator', operatorRoutes)
    app.use('/api/v1/schedules', scheduleRoutes)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    // Manager A is a "legacy" operator: role OPERATOR, linked to the company only by
    // phone number, with NO staff record yet (like Selam Bus before this patch).
    managerA = await makeUser('manager A', 'OPERATOR')
    operatorA = await prisma.operator.create({ data: { companyName: `${tag} A`, licenseNo: `${tag}-A`, phone: managerA.phone } })
    managerB = await makeUser('manager B', 'OPERATOR')
    operatorB = await prisma.operator.create({ data: { companyName: `${tag} B`, licenseNo: `${tag}-B`, phone: managerB.phone } })
    created.operators.push(operatorA.id, operatorB.id)
    // Company B's manager already has a staff record (the normal case after this patch)
    await prisma.operatorStaff.create({ data: { userId: managerB.id, operatorId: operatorB.id, role: 'MANAGER' } })

    legacyOperator = await makeUser('operator without company', 'OPERATOR')
    customer = await makeUser('passenger', 'CUSTOMER')
    admin = await makeUser('admin', 'ADMIN')
    tokManagerA = token(managerA.id, 'OPERATOR')
    tokManagerB = token(managerB.id, 'OPERATOR')
    tokCustomer = token(customer.id, 'CUSTOMER')
    tokAdmin = token(admin.id, 'ADMIN')

    route = await prisma.route.create({ data: { fromCity: `${tag}-From`, toCity: `${tag}-To`, distanceKm: 100, estimatedDurationMin: 120 } })
    created.routes.push(route.id)
    busA = await prisma.bus.create({ data: { operatorId: operatorA.id, plateNumber: `${tag}-A1`, totalSeats: 10 } })
    busB = await prisma.bus.create({ data: { operatorId: operatorB.id, plateNumber: `${tag}-B1`, totalSeats: 10 } })
    created.buses.push(busA.id, busB.id)
    const dep = new Date(Date.now() + 3 * 24 * 3600 * 1000)
    tripA = await prisma.schedule.create({
      data: { routeId: route.id, busId: busA.id, departureTime: dep, arrivalTime: new Date(dep.getTime() + 7200000), price: 100 },
    })
  })

  afterAll(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
    if (prisma) {
      await prisma.schedule.deleteMany({ where: { busId: { in: created.buses } } })
      await prisma.scheduleTemplate.deleteMany({ where: { busId: { in: created.buses } } })
      await prisma.bus.deleteMany({ where: { id: { in: created.buses } } })
      await prisma.route.deleteMany({ where: { id: { in: created.routes } } })
      // Staff accounts made through the API
      const made = await prisma.user.findMany({ where: { name: { startsWith: tag } }, select: { id: true } })
      made.forEach((u) => created.users.add(u.id))
      await prisma.operator.deleteMany({ where: { id: { in: created.operators } } }) // staff rows cascade
      await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } })
      await prisma.$disconnect()
    }
  })

  // ─── Migration of the old phone-number link ─────────────
  it('turns a legacy operator (phone match) into the MANAGER of their company, once', async () => {
    expect(await prisma.operatorStaff.count({ where: { userId: managerA.id } })).toBe(0)
    const first = await api('GET', '/api/v1/operator/profile', tokManagerA)
    expect(first.status).toBe(200)
    expect(first.body.data.operator.id).toBe(operatorA.id)
    // Several requests at the same time must still create a single record
    await Promise.all([1, 2, 3, 4].map(() => api('GET', '/api/v1/operator/stats', tokManagerA)))
    const rows = await prisma.operatorStaff.findMany({ where: { userId: managerA.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ role: 'MANAGER', active: true, operatorId: operatorA.id })
  })

  it('refuses an OPERATOR account that matches no company, and passengers', async () => {
    const legacy = await api('GET', '/api/v1/operator/buses', token(legacyOperator.id, 'OPERATOR'))
    expect(legacy.status).toBe(403)
    const passenger = await api('GET', '/api/v1/operator/buses', tokCustomer)
    expect(passenger.status).toBe(403)
    const none = await api('GET', '/api/v1/operator/buses')
    expect(none.status).toBe(401)
  })

  // ─── Adding staff ───────────────────────────────────────
  it('lets a manager add a seller and a checker, as new accounts', async () => {
    const s = await api('POST', '/api/v1/operator/staff', tokManagerA, { name: `${tag} seller`, phone: newPhone(), password: 'seller-pass', role: 'SELLER' })
    expect(s.status).toBe(201)
    expect(s.body.data.staff.role).toBe('SELLER')
    expect(JSON.stringify(s.body)).not.toMatch(/password/i)
    const c = await api('POST', '/api/v1/operator/staff', tokManagerA, { name: `${tag} checker`, phone: newPhone(), password: 'checker-pass', role: 'CHECKER' })
    expect(c.status).toBe(201)

    seller = await prisma.user.findUniqueOrThrow({ where: { id: s.body.data.staff.user.id } })
    checker = await prisma.user.findUniqueOrThrow({ where: { id: c.body.data.staff.user.id } })
    expect(seller.role).toBe('OPERATOR')
    expect(seller.password).not.toBe('seller-pass') // stored hashed
    tokSeller = token(seller.id, 'OPERATOR')
    tokChecker = token(checker.id, 'OPERATOR')
    expect(await prisma.operatorStaff.findUniqueOrThrow({ where: { userId: seller.id } })).toMatchObject({ operatorId: operatorA.id, role: 'SELLER' })
  })

  it('rejects bad input and phone numbers that already have an account', async () => {
    const dup = await api('POST', '/api/v1/operator/staff', tokManagerA, { name: 'Passenger Pat', phone: customer.phone, password: 'abcdef', role: 'SELLER' })
    expect(dup.status).toBe(409)
    // The passenger account is untouched: still a passenger, not staff
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customer.id } })).role).toBe('CUSTOMER')
    expect(await prisma.operatorStaff.count({ where: { userId: customer.id } })).toBe(0)

    expect((await api('POST', '/api/v1/operator/staff', tokManagerA, { name: 'X Y', phone: '12345', password: 'abcdef', role: 'SELLER' })).status).toBe(400)
    expect((await api('POST', '/api/v1/operator/staff', tokManagerA, { name: 'X Y', phone: newPhone(), password: '123', role: 'SELLER' })).status).toBe(400)
    expect((await api('POST', '/api/v1/operator/staff', tokManagerA, { name: 'X Y', phone: newPhone(), password: 'abcdef', role: 'ADMIN' })).status).toBe(400)
  })

  it('login tells the web app the role and company of staff, and nothing for passengers', async () => {
    const login = await api('POST', '/api/v1/auth/login', undefined, { phone: seller.phone, password: 'seller-pass' })
    expect(login.status).toBe(200)
    expect(login.body.data.user.staff).toMatchObject({ role: 'SELLER', operatorId: operatorA.id, companyName: `${tag} A` })
    const me = await api('GET', '/api/v1/auth/me', login.body.data.token)
    expect(me.body.data.user.staff.role).toBe('SELLER')
    expect(JSON.stringify(login.body)).not.toContain(seller.password)
    expect(login.body.data.user.password).toBeUndefined()

    expect((await api('GET', '/api/v1/auth/me', tokManagerA)).body.data.user.staff.role).toBe('MANAGER')
    expect((await api('GET', '/api/v1/auth/me', tokCustomer)).body.data.user.staff).toBeNull()
  })

  // ─── Sellers and checkers cannot do manager things ──────
  it('keeps sellers and checkers out of every manager endpoint', async () => {
    const attempts: [string, string, unknown?][] = [
      ['GET', '/api/v1/operator/profile'],
      ['GET', '/api/v1/operator/buses'],
      ['POST', '/api/v1/operator/buses', { plateNumber: `${tag}-X`, totalSeats: 40, busType: 'STANDARD' }],
      ['GET', '/api/v1/operator/bookings'],
      ['GET', '/api/v1/operator/stats'],
      ['GET', '/api/v1/operator/analytics'],
      ['GET', '/api/v1/operator/availability'],
      ['GET', '/api/v1/operator/pickups'],
      ['POST', '/api/v1/operator/pickups', { routeId: route.id, name: 'Nope' }],
      ['GET', '/api/v1/operator/templates'],
      ['POST', '/api/v1/operator/templates', { routeId: route.id, busId: busA.id, departureTime: '05:00', price: 100, daysOfWeek: [1] }],
      ['POST', '/api/v1/schedules', { routeId: route.id, busId: busA.id, departureTime: new Date().toISOString(), arrivalTime: new Date().toISOString(), price: 1 }],
      ['PATCH', `/api/v1/schedules/${tripA.id}/status`, { status: 'CLOSED' }],
      ['DELETE', `/api/v1/schedules/${tripA.id}`],
      ['GET', '/api/v1/operator/staff'],
      ['POST', '/api/v1/operator/staff', { name: 'Evil Staff', phone: newPhone(), password: 'abcdef', role: 'MANAGER' }],
      ['PATCH', `/api/v1/operator/staff/${'x'}`, { active: false }],
    ]
    for (const tok of [tokSeller, tokChecker]) {
      for (const [method, path, body] of attempts) {
        const out = await api(method, path, tok, body)
        expect(out.status, `${method} ${path}`).toBe(403)
      }
    }
    // Nothing was changed by those attempts
    expect((await prisma.schedule.findUniqueOrThrow({ where: { id: tripA.id } })).status).toBe('OPEN')
    expect(await prisma.bus.count({ where: { plateNumber: `${tag}-X` } })).toBe(0)
  })

  it('lets the manager do all of those', async () => {
    expect((await api('GET', '/api/v1/operator/buses', tokManagerA)).status).toBe(200)
    expect((await api('GET', '/api/v1/operator/bookings', tokManagerA)).status).toBe(200)
    expect((await api('GET', '/api/v1/operator/pickups', tokManagerA)).status).toBe(200)
    expect((await api('GET', '/api/v1/operator/templates', tokManagerA)).status).toBe(200)
    const closed = await api('PATCH', `/api/v1/schedules/${tripA.id}/status`, tokManagerA, { status: 'CLOSED' })
    expect(closed.status).toBe(200)
    expect((await api('PATCH', `/api/v1/schedules/${tripA.id}/status`, tokManagerA, { status: 'OPEN' })).status).toBe(200)
  })

  // ─── One company can never touch another ────────────────
  it("keeps company B away from company A's data", async () => {
    const buses = await api('GET', '/api/v1/operator/buses', tokManagerB)
    expect(buses.body.data.buses.map((b: any) => b.id)).toEqual([busB.id])

    const staff = await api('GET', '/api/v1/operator/staff', tokManagerB)
    expect(staff.body.data.staff.map((s: any) => s.user.id)).toEqual([managerB.id])

    expect((await api('PATCH', `/api/v1/schedules/${tripA.id}/status`, tokManagerB, { status: 'CLOSED' })).status).toBe(403)
    expect((await api('DELETE', `/api/v1/schedules/${tripA.id}`, tokManagerB)).status).toBe(403)
    expect((await api('POST', '/api/v1/operator/templates', tokManagerB, { routeId: route.id, busId: busA.id, departureTime: '05:00', price: 100, daysOfWeek: [1] })).status).toBe(403)

    const sellerRow = await prisma.operatorStaff.findUniqueOrThrow({ where: { userId: seller.id } })
    // A staff member of another company looks like one that does not exist
    expect((await api('PATCH', `/api/v1/operator/staff/${sellerRow.id}`, tokManagerB, { active: false })).status).toBe(404)
    expect((await api('POST', `/api/v1/operator/staff/${sellerRow.id}/password`, tokManagerB, { password: 'hacked1' })).status).toBe(404)
    expect((await prisma.operatorStaff.findUniqueOrThrow({ where: { id: sellerRow.id } })).active).toBe(true)
    const stillWorks = await api('POST', '/api/v1/auth/login', undefined, { phone: seller.phone, password: 'seller-pass' })
    expect(stillWorks.status).toBe(200)
  })

  it("never shows company A's bookings, revenue or trips to company B", async () => {
    const booking = await prisma.booking.create({
      data: { userId: customer.id, scheduleId: tripA.id, seatNumbers: ['01'], totalPrice: 100, status: 'CONFIRMED', qrCode: `${tag}-QR` },
    })
    try {
      const mine = await api('GET', '/api/v1/operator/bookings', tokManagerA)
      expect(mine.body.data.bookings.map((b: any) => b.id)).toContain(booking.id)
      expect(mine.body.data.totalRevenue).toBeGreaterThanOrEqual(100)

      const theirs = await api('GET', '/api/v1/operator/bookings', tokManagerB)
      expect(theirs.body.data.bookings.map((b: any) => b.id)).not.toContain(booking.id)
      expect(JSON.stringify(theirs.body)).not.toContain(customer.phone)
      expect(theirs.body.data.totalRevenue).toBe(0)

      const stats = await api('GET', '/api/v1/operator/stats', tokManagerB)
      expect(stats.body.data.totalBookings).toBe(0)
      expect(stats.body.data.operatorName).toBe(`${tag} B`)

      const availability = await api('GET', '/api/v1/operator/availability', tokManagerB)
      expect(availability.body.data.schedules.map((x: any) => x.id)).not.toContain(tripA.id)
    } finally {
      await prisma.booking.delete({ where: { id: booking.id } })
    }
  })

  it('does not trust a company sent by the caller', async () => {
    // Even if the request names another company, the manager's own company is used
    const out = await api('POST', '/api/v1/operator/staff', tokManagerB, {
      name: `${tag} sneaky`, phone: newPhone(), password: 'abcdef', role: 'SELLER', operatorId: operatorA.id,
    })
    expect(out.status).toBe(201)
    const row = await prisma.operatorStaff.findUniqueOrThrow({ where: { userId: out.body.data.staff.user.id } })
    expect(row.operatorId).toBe(operatorB.id)
  })

  it('a person can belong to only one company', async () => {
    await expect(
      prisma.operatorStaff.create({ data: { userId: seller.id, operatorId: operatorB.id, role: 'SELLER' } })
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  // ─── Deactivating works immediately ─────────────────────
  it('stops a deactivated seller at once, even with a valid token, and restores them on reactivation', async () => {
    const row = await prisma.operatorStaff.findUniqueOrThrow({ where: { userId: seller.id } })
    expect((await api('GET', '/api/v1/auth/me', tokSeller)).body.data.user.staff.role).toBe('SELLER')

    const off = await api('PATCH', `/api/v1/operator/staff/${row.id}`, tokManagerA, { active: false })
    expect(off.status).toBe(200)
    // The token is the same one issued before; it must no longer work for staff things
    expect((await api('GET', '/api/v1/operator/staff', tokSeller)).status).toBe(403)
    expect((await api('GET', '/api/v1/auth/me', tokSeller)).body.data.user.staff).toBeNull()
    const login = await api('POST', '/api/v1/auth/login', undefined, { phone: seller.phone, password: 'seller-pass' })
    expect(login.body.data.user.staff).toBeNull()
    expect(login.body.data.user.role).toBe('CUSTOMER')
    // Deactivated people are not revived by the old phone-number migration
    expect((await api('GET', '/api/v1/operator/buses', token(seller.id, 'OPERATOR'))).status).toBe(403)

    const on = await api('PATCH', `/api/v1/operator/staff/${row.id}`, tokManagerA, { active: true })
    expect(on.status).toBe(200)
    expect((await api('GET', '/api/v1/auth/me', tokSeller)).body.data.user.staff.role).toBe('SELLER')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })).role).toBe('OPERATOR')
  })

  it('locks out a deactivated MANAGER at once, even with a valid token', async () => {
    const m = await api('POST', '/api/v1/operator/staff', tokManagerA, { name: `${tag} manager 3`, phone: newPhone(), password: 'third-pass', role: 'MANAGER' })
    expect(m.status).toBe(201)
    const tok = token(m.body.data.staff.user.id, 'OPERATOR')
    expect((await api('GET', '/api/v1/operator/buses', tok)).status).toBe(200)
    expect((await api('GET', '/api/v1/operator/staff', tok)).status).toBe(200)

    expect((await api('PATCH', `/api/v1/operator/staff/${m.body.data.staff.id}`, tokManagerA, { active: false })).status).toBe(200)
    // Same token as before: every manager endpoint must now refuse it
    expect((await api('GET', '/api/v1/operator/buses', tok)).status).toBe(403)
    expect((await api('GET', '/api/v1/operator/staff', tok)).status).toBe(403)
    expect((await api('PATCH', `/api/v1/schedules/${tripA.id}/status`, tok, { status: 'CLOSED' })).status).toBe(403)
    expect((await prisma.schedule.findUniqueOrThrow({ where: { id: tripA.id } })).status).toBe('OPEN')

    expect((await api('PATCH', `/api/v1/operator/staff/${m.body.data.staff.id}`, tokManagerA, { active: true })).status).toBe(200)
    expect((await api('GET', '/api/v1/operator/buses', tok)).status).toBe(200)
    // Leave company A with just its first manager for the next tests
    await api('PATCH', `/api/v1/operator/staff/${m.body.data.staff.id}`, tokManagerA, { active: false })
  })

  it('changes a role, and the new role applies at once', async () => {
    const row = await prisma.operatorStaff.findUniqueOrThrow({ where: { userId: checker.id } })
    const out = await api('PATCH', `/api/v1/operator/staff/${row.id}`, tokManagerA, { role: 'SELLER' })
    expect(out.status).toBe(200)
    expect((await api('GET', '/api/v1/auth/me', tokChecker)).body.data.user.staff.role).toBe('SELLER')
    await api('PATCH', `/api/v1/operator/staff/${row.id}`, tokManagerA, { role: 'CHECKER' })
    expect((await api('PATCH', `/api/v1/operator/staff/${row.id}`, tokManagerA, {})).status).toBe(400)
  })

  // ─── Safety rules for managers ──────────────────────────
  it('does not let a manager change their own role or access', async () => {
    const own = await prisma.operatorStaff.findUniqueOrThrow({ where: { userId: managerA.id } })
    const out = await api('PATCH', `/api/v1/operator/staff/${own.id}`, tokManagerA, { active: false })
    expect(out.status).toBe(400)
    expect((await prisma.operatorStaff.findUniqueOrThrow({ where: { id: own.id } })).active).toBe(true)
  })

  it('never leaves a company without an active manager', async () => {
    // Directly: the only manager of company B is the target, asked by "someone else"
    const onlyManager = await prisma.operatorStaff.findUniqueOrThrow({ where: { userId: managerB.id } })
    const calls: { status: number; body: any }[] = []
    const res: any = { status(c: number) { calls.push({ status: c, body: null }); return res }, json(b: any) { calls[calls.length - 1].body = b; return res } }
    await staffCtl.updateStaff({ userId: 'someone-else', operatorId: operatorB.id, params: { id: onlyManager.id }, body: { active: false } } as any, res)
    expect(calls[0].status).toBe(409)
    await staffCtl.updateStaff({ userId: 'someone-else', operatorId: operatorB.id, params: { id: onlyManager.id }, body: { role: 'SELLER' } } as any, res)
    expect(calls[1].status).toBe(409)
    expect((await prisma.operatorStaff.findUniqueOrThrow({ where: { id: onlyManager.id } })).role).toBe('MANAGER')
  })

  it('two managers removing each other at the same moment still leaves one', async () => {
    const m2 = await api('POST', '/api/v1/operator/staff', tokManagerA, { name: `${tag} manager 2`, phone: newPhone(), password: 'second-pass', role: 'MANAGER' })
    expect(m2.status).toBe(201)
    const tok2 = token(m2.body.data.staff.user.id, 'OPERATOR')
    const row1 = await prisma.operatorStaff.findUniqueOrThrow({ where: { userId: managerA.id } })
    const row2 = m2.body.data.staff

    const [a, b] = await Promise.all([
      api('PATCH', `/api/v1/operator/staff/${row2.id}`, tokManagerA, { active: false }),
      api('PATCH', `/api/v1/operator/staff/${row1.id}`, tok2, { active: false }),
    ])
    expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1)
    const activeManagers = await prisma.operatorStaff.count({ where: { operatorId: operatorA.id, role: 'MANAGER', active: true } })
    expect(activeManagers).toBe(1)
    // Put manager A back in charge for the tests that follow
    await prisma.operatorStaff.updateMany({ where: { operatorId: operatorA.id, role: 'MANAGER' }, data: { active: true } })
    await prisma.user.updateMany({ where: { id: managerA.id }, data: { role: 'OPERATOR' } })
  })

  // ─── Passwords ──────────────────────────────────────────
  it("lets a manager reset a seller's password, but not another manager's", async () => {
    const row = await prisma.operatorStaff.findUniqueOrThrow({ where: { userId: seller.id } })
    const out = await api('POST', `/api/v1/operator/staff/${row.id}/password`, tokManagerA, { password: 'brand-new-pass' })
    expect(out.status).toBe(200)
    expect((await api('POST', '/api/v1/auth/login', undefined, { phone: seller.phone, password: 'seller-pass' })).status).toBe(401)
    expect((await api('POST', '/api/v1/auth/login', undefined, { phone: seller.phone, password: 'brand-new-pass' })).status).toBe(200)
    expect((await api('POST', `/api/v1/operator/staff/${row.id}/password`, tokManagerA, { password: '123' })).status).toBe(400)

    const otherManager = await prisma.operatorStaff.findFirstOrThrow({ where: { operatorId: operatorA.id, role: 'MANAGER', userId: { not: managerA.id } } })
    expect((await api('POST', `/api/v1/operator/staff/${otherManager.id}/password`, tokManagerA, { password: 'takeover1' })).status).toBe(403)
  })

  // ─── The master admin ───────────────────────────────────
  it('lets the admin use company-wide endpoints but not the staff screens', async () => {
    const templates = await api('GET', '/api/v1/operator/templates', tokAdmin)
    expect(templates.status).toBe(200)
    expect((await api('PATCH', `/api/v1/schedules/${tripA.id}/status`, tokAdmin, { status: 'OPEN' })).status).toBe(200)
    expect((await api('GET', '/api/v1/operator/staff', tokAdmin)).status).toBe(403)
    // Endpoints that only make sense inside one company have no company for the admin
    expect((await api('GET', '/api/v1/operator/buses', tokAdmin)).status).toBe(404)
  })

  it('does not trust an old admin token after the person lost the admin role', async () => {
    const exAdmin = await makeUser('former admin', 'CUSTOMER')
    const out = await api('GET', '/api/v1/operator/templates', token(exAdmin.id, 'ADMIN'))
    expect(out.status).toBe(403)
  })

  // ─── Fail closed ────────────────────────────────────────
  it('refuses a request that never went through the permission middleware', async () => {
    const calls: { status: number }[] = []
    const res: any = { status(c: number) { calls.push({ status: c }); return res }, json() { return res } }
    // A logged-in user (even claiming ADMIN in the token) with no company attached
    await templateCtl.listTemplates({ userId: 'x', userRole: 'ADMIN' } as any, res)
    await templateCtl.listTemplates({ userId: 'x', userRole: 'OPERATOR' } as any, res)
    expect(calls.map((c) => c.status)).toEqual([403, 403])
  })
})
