/**
 * Database tests for platform administration (Patch F1): creating companies,
 * suspending them, demo companies, password resets, the dashboard and the
 * "needs attention" list. Through the REAL routes over HTTP.
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

// Online bookings need a name for every seat
const pax = (seats: string[]) => seats.map((s) => ({ seatNumber: s, name: `Test Passenger ${s}` }))

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

async function makeUser(label: string, role: 'CUSTOMER' | 'OPERATOR' | 'ADMIN', phone = newPhone()) {
  const user = await prisma.user.create({ data: { name: `${tag} ${label}`, phone, password: 'x', role } })
  created.users.add(user.id)
  return { user, tok: token(user.id, role) }
}

/** A company created directly in the database, with a manager, seller and checker and one bus. */
async function makeCompany(label: string, over: Record<string, unknown> = {}) {
  const operator = await prisma.operator.create({
    data: { companyName: `${tag} ${label}`, licenseNo: newLicense(), phone: '0900000000', ...over },
  })
  created.operators.add(operator.id)
  const mk = async (role: 'MANAGER' | 'SELLER' | 'CHECKER') => {
    const u = await makeUser(`${label} ${role}`, 'OPERATOR')
    const staff = await prisma.operatorStaff.create({ data: { userId: u.user.id, operatorId: operator.id, role } })
    return { ...u, staff }
  }
  const manager = await mk('MANAGER')
  const seller = await mk('SELLER')
  const checker = await mk('CHECKER')
  const bus = await prisma.bus.create({ data: { operatorId: operator.id, plateNumber: `${tag}-${label}-1`, totalSeats: 10 } })
  return { operator, manager, seller, checker, bus }
}

let route: any, admin: { user: any; tok: string }, customer: { user: any; tok: string }
type Company = Awaited<ReturnType<typeof makeCompany>>
let tripCounter = 0
async function newTrip(c: Company, hoursAhead = 48) {
  const dep = new Date(Date.now() + hoursAhead * 3600 * 1000 + tripCounter++ * 60000)
  return prisma.schedule.create({
    data: { routeId: route.id, busId: c.bus.id, departureTime: dep, arrivalTime: new Date(dep.getTime() + 7200000), price: 100 },
  })
}

const searchFor = async (tripDate: Date) => {
  const day = new Date(tripDate.getTime() + 3 * 3600000).toISOString().slice(0, 10) // Addis day
  const out = await api('GET', `/api/v1/schedules/search?fromCity=${encodeURIComponent(route.fromCity)}&toCity=${encodeURIComponent(route.toCity)}&date=${day}`)
  return out.body.data.schedules.map((s: any) => s.id) as string[]
}

describe.skipIf(!TEST_URL)('platform administration (database, real routes)', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    const app = express()
    app.use(express.json())
    app.use('/api/v1/auth', (await import('../src/routes/auth.routes')).default)
    app.use('/api/v1/admin', (await import('../src/routes/admin.routes')).default)
    app.use('/api/v1/operator', (await import('../src/routes/operator.routes')).default)
    app.use('/api/v1/schedules', (await import('../src/routes/schedule.routes')).default)
    app.use('/api/v1/bookings', (await import('../src/routes/booking.routes')).default)
    app.use('/api/v1/counter', (await import('../src/routes/counter.routes')).default)
    app.use('/api/v1/checkin', (await import('../src/routes/checkin.routes')).default)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    admin = await makeUser('admin', 'ADMIN')
    customer = await makeUser('passenger', 'CUSTOMER')
    route = await prisma.route.create({ data: { fromCity: `${tag}-From`, toCity: `${tag}-To`, distanceKm: 100, estimatedDurationMin: 120 } })
    created.routes.push(route.id)
  })

  afterAll(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
    if (prisma) {
      // Companies made through the API have accounts we didn't track
      const made = await prisma.user.findMany({ where: { name: { startsWith: tag } }, select: { id: true } })
      made.forEach((u) => created.users.add(u.id))
      const ops = await prisma.operator.findMany({ where: { companyName: { startsWith: tag } }, select: { id: true } })
      ops.forEach((o) => created.operators.add(o.id))
      const buses = await prisma.bus.findMany({ where: { operatorId: { in: [...created.operators] } }, select: { id: true } })
      const trips = await prisma.schedule.findMany({ where: { busId: { in: buses.map((b) => b.id) } }, select: { id: true } })
      const tripIds = trips.map((t) => t.id)
      await prisma.payment.deleteMany({ where: { booking: { scheduleId: { in: tripIds } } } })
      await prisma.booking.deleteMany({ where: { scheduleId: { in: tripIds } } })
      await prisma.schedule.deleteMany({ where: { id: { in: tripIds } } })
      await prisma.bus.deleteMany({ where: { id: { in: buses.map((b) => b.id) } } })
      await prisma.route.deleteMany({ where: { id: { in: created.routes } } })
      await prisma.operator.deleteMany({ where: { id: { in: [...created.operators] } } }) // staff rows cascade
      await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } })
      await prisma.$disconnect()
    }
  })

  // ─── Who may use the admin routes ───────────────────────
  it('lets only the platform admin in, and checks the role in the database, not the token', async () => {
    const co = await makeCompany('perm')
    const paths = ['/api/v1/admin/dashboard', '/api/v1/admin/attention', '/api/v1/admin/operators']
    for (const p of paths) {
      expect((await api('GET', p)).status).toBe(401)
      expect((await api('GET', p, customer.tok)).status).toBe(403)
      expect((await api('GET', p, co.manager.tok)).status).toBe(403)
      expect((await api('GET', p, co.seller.tok)).status).toBe(403)
      expect((await api('GET', p, admin.tok)).status).toBe(200)
    }
    // A token that says ADMIN for an account that is not an admin in the database
    const fake = token(customer.user.id, 'ADMIN')
    expect((await api('GET', '/api/v1/admin/operators', fake)).status).toBe(403)
    expect((await api('POST', '/api/v1/admin/operators', co.manager.tok, {})).status).toBe(403)
    expect((await api('POST', `/api/v1/admin/operators/${co.operator.id}/suspend`, co.manager.tok, { reason: 'self' })).status).toBe(403)
  })

  // ─── Creating a company ─────────────────────────────────
  it('creates a company with its first manager in one step, with 5% commission by default', async () => {
    const managerPhone = newPhone()
    const out = await api('POST', '/api/v1/admin/operators', admin.tok, {
      companyName: `${tag} Selam Real`, licenseNo: newLicense(), phone: newPhone(),
      managerName: `${tag} Manager One`, managerPhone, managerPassword: 'secret12',
    })
    expect(out.status).toBe(201)
    const op = out.body.data.operator
    expect(op).toMatchObject({ status: 'ACTIVE', isDemo: false, commissionPercent: 5, buses: 0, activeStaff: 1 })
    expect(op.manager).toMatchObject({ phone: managerPhone })

    // The manager can log in and is the manager of exactly this company
    const login = await api('POST', '/api/v1/auth/login', undefined, { phone: managerPhone, password: 'secret12' })
    expect(login.status).toBe(200)
    expect(login.body.data.user.staff).toMatchObject({ role: 'MANAGER', operatorId: op.id, suspended: false })
    const profile = await api('GET', '/api/v1/operator/profile', login.body.data.token)
    expect(profile.body.data.operator.id).toBe(op.id)

    const row = await prisma.user.findUniqueOrThrow({ where: { phone: managerPhone } })
    expect(row.password).not.toBe('secret12') // stored hashed
    expect(row.role).toBe('OPERATOR')
  })

  it('creates a company at 0% commission and as a demo company when asked', async () => {
    const out = await api('POST', '/api/v1/admin/operators', admin.tok, {
      companyName: `${tag} Pilot`, licenseNo: newLicense(), phone: newPhone(), commissionPercent: 0, isDemo: true, notes: 'first pilot',
      managerName: `${tag} Pilot Manager`, managerPhone: newPhone(), managerPassword: 'secret12',
    })
    expect(out.status).toBe(201)
    expect(out.body.data.operator).toMatchObject({ commissionPercent: 0, isDemo: true, notes: 'first pilot' })
  })

  it('refuses bad input, duplicates and taking over an existing account, and creates nothing then', async () => {
    const base = () => ({
      companyName: `${tag} Bad`, licenseNo: newLicense(), phone: newPhone(),
      managerName: `${tag} Bad Manager`, managerPhone: newPhone(), managerPassword: 'secret12',
    })
    const countBefore = await prisma.operator.count({ where: { companyName: `${tag} Bad` } })

    expect((await api('POST', '/api/v1/admin/operators', admin.tok, { ...base(), managerPhone: '12345' })).status).toBe(400)
    expect((await api('POST', '/api/v1/admin/operators', admin.tok, { ...base(), phone: 'abc' })).status).toBe(400)
    expect((await api('POST', '/api/v1/admin/operators', admin.tok, { ...base(), managerPassword: '123' })).status).toBe(400)
    expect((await api('POST', '/api/v1/admin/operators', admin.tok, { ...base(), companyName: '' })).status).toBe(400)
    expect((await api('POST', '/api/v1/admin/operators', admin.tok, { ...base(), commissionPercent: -1 })).status).toBe(400)
    expect((await api('POST', '/api/v1/admin/operators', admin.tok, { ...base(), commissionPercent: 80 })).status).toBe(400)

    // The manager phone already belongs to a passenger (also in the +251 form): never taken over
    const plus = `+251${customer.user.phone.slice(1)}`
    const taken = await api('POST', '/api/v1/admin/operators', admin.tok, { ...base(), managerPhone: plus })
    expect(taken.status).toBe(409)
    expect((await api('POST', '/api/v1/admin/operators', admin.tok, { ...base(), managerPhone: customer.user.phone })).status).toBe(409)

    // Duplicate license number
    const existing = await makeCompany('dup')
    const dup = await api('POST', '/api/v1/admin/operators', admin.tok, { ...base(), licenseNo: existing.operator.licenseNo })
    expect(dup.status).toBe(409)

    expect(await prisma.operator.count({ where: { companyName: `${tag} Bad` } })).toBe(countBefore)
    expect(await prisma.user.count({ where: { name: `${tag} Bad Manager` } })).toBe(0)
  })

  it('does not let a new company phone number hand the company to an old operator account', async () => {
    // An old-style operator: role OPERATOR, no staff record, linked only by phone number
    const legacy = await makeUser('legacy operator', 'OPERATOR')
    const out = await api('POST', '/api/v1/admin/operators', admin.tok, {
      companyName: `${tag} Hijack`, licenseNo: newLicense(), phone: legacy.user.phone,
      managerName: `${tag} Real Manager`, managerPhone: newPhone(), managerPassword: 'secret12',
    })
    expect(out.status).toBe(409)
    expect(await prisma.operator.count({ where: { companyName: `${tag} Hijack` } })).toBe(0)
    // And the old account still has no company
    expect((await api('GET', '/api/v1/operator/profile', legacy.tok)).status).toBe(403)

    // Using the new manager's own number as the company phone is fine
    const own = newPhone()
    const ok = await api('POST', '/api/v1/admin/operators', admin.tok, {
      companyName: `${tag} Own Phone`, licenseNo: newLicense(), phone: own,
      managerName: `${tag} Own Manager`, managerPhone: own, managerPassword: 'secret12',
    })
    expect(ok.status).toBe(201)
  })

  // ─── Editing ────────────────────────────────────────────
  it('edits company details, commission and the demo flag', async () => {
    const co = await makeCompany('edit')
    const out = await api('PATCH', `/api/v1/admin/operators/${co.operator.id}`, admin.tok, { commissionPercent: 0, isDemo: true, companyName: `${tag} Renamed`, notes: 'x' })
    expect(out.status).toBe(200)
    expect(out.body.data.operator).toMatchObject({ commissionPercent: 0, isDemo: true, companyName: `${tag} Renamed`, notes: 'x' })
    expect((await api('PATCH', `/api/v1/admin/operators/${co.operator.id}`, admin.tok, {})).status).toBe(400)
    expect((await api('PATCH', `/api/v1/admin/operators/${co.operator.id}`, admin.tok, { commissionPercent: 99 })).status).toBe(400)
    expect((await api('PATCH', '/api/v1/admin/operators/nope', admin.tok, { isDemo: false })).status).toBe(404)
    const other = await makeCompany('edit2')
    expect((await api('PATCH', `/api/v1/admin/operators/${co.operator.id}`, admin.tok, { licenseNo: other.operator.licenseNo })).status).toBe(409)
  })

  it("never shows the commission rate or the admin's notes to passengers", async () => {
    const co = await makeCompany('private', { commissionPercent: 3.5, notes: 'secret admin note' })
    const trip = await newTrip(co)
    const everything = JSON.stringify([
      (await api('GET', `/api/v1/schedules/search?fromCity=${encodeURIComponent(route.fromCity)}&toCity=${encodeURIComponent(route.toCity)}`)).body,
      (await api('GET', '/api/v1/schedules')).body,
      (await api('GET', `/api/v1/schedules/${trip.id}`)).body,
    ])
    expect(everything).toContain(co.operator.companyName) // the trip is listed...
    expect(everything).not.toContain('commissionPercent')
    expect(everything).not.toContain('secret admin note')
    expect(everything).not.toContain('suspendedReason')
    // ...and the company's own profile hides the admin's note too
    const profile = await api('GET', '/api/v1/operator/profile', co.manager.tok)
    expect(JSON.stringify(profile.body)).not.toContain('secret admin note')
    expect(profile.body.data.operator.commissionPercent).toBe(3.5)
  })

  // ─── Suspending ─────────────────────────────────────────
  it('suspends a company: staff are stopped, its trips vanish and nobody can book it; reactivating restores it', async () => {
    const bcrypt = (await import('bcryptjs')).default
    const co = await makeCompany('susp')
    await prisma.user.update({ where: { id: co.manager.user.id }, data: { password: await bcrypt.hash('susp-pass1', 4) } })
    const trip = await newTrip(co)
    expect(await searchFor(trip.departureTime)).toContain(trip.id)
    expect((await api('POST', '/api/v1/bookings', customer.tok, { scheduleId: trip.id, seatNumbers: ['01'], passengers: pax(['01']) })).status).toBe(201)

    expect((await api('POST', `/api/v1/admin/operators/${co.operator.id}/suspend`, admin.tok, {})).status).toBe(400) // reason needed
    const s = await api('POST', `/api/v1/admin/operators/${co.operator.id}/suspend`, admin.tok, { reason: 'License expired' })
    expect(s.status).toBe(200)
    expect((await api('POST', `/api/v1/admin/operators/${co.operator.id}/suspend`, admin.tok, { reason: 'again' })).status).toBe(409)

    // Every kind of staff is stopped at once, with a clear message
    for (const [who, path] of [
      [co.manager, '/api/v1/operator/buses'],
      [co.seller, '/api/v1/counter/sales'],
      [co.checker, '/api/v1/checkin/trips'],
    ] as const) {
      const out = await api('GET', path, who.tok)
      expect(out.status).toBe(403)
      expect(out.body.error).toMatch(/suspended/i)
    }
    // They can still log in, and the web app is told why they can't work
    const login = await api('POST', '/api/v1/auth/login', undefined, { phone: co.manager.user.phone, password: 'susp-pass1' })
    expect(login.status).toBe(200)
    expect(login.body.data.user.staff).toMatchObject({ role: 'MANAGER', suspended: true })

    // Passengers: hidden from search and the public list, and no new bookings
    expect(await searchFor(trip.departureTime)).not.toContain(trip.id)
    const list = await api('GET', '/api/v1/schedules')
    expect(list.body.data.schedules.map((x: any) => x.id)).not.toContain(trip.id)
    const refused = await api('POST', '/api/v1/bookings', customer.tok, { scheduleId: trip.id, seatNumbers: ['02'], passengers: pax(['02']) })
    expect(refused.status).toBe(409)
    expect(refused.body.error).toMatch(/not taking bookings/i)
    expect((await api('GET', `/api/v1/schedules/${trip.id}`)).body.data.schedule.bookable).toBe(false)
    // The earlier booking is untouched
    expect(await prisma.booking.count({ where: { scheduleId: trip.id, status: 'PENDING' } })).toBe(1)

    // The admin still sees the trip
    const adminList = await api('GET', '/api/v1/schedules?includeHidden=true', admin.tok)
    expect(adminList.body.data.schedules.map((x: any) => x.id)).toContain(trip.id)
    const asPublic = await api('GET', '/api/v1/schedules?includeHidden=true')
    expect(asPublic.body.data.schedules.map((x: any) => x.id)).not.toContain(trip.id)

    const r = await api('POST', `/api/v1/admin/operators/${co.operator.id}/reactivate`, admin.tok)
    expect(r.status).toBe(200)
    expect((await api('POST', `/api/v1/admin/operators/${co.operator.id}/reactivate`, admin.tok)).status).toBe(409)
    expect(await searchFor(trip.departureTime)).toContain(trip.id)
    expect((await api('GET', '/api/v1/operator/buses', co.manager.tok)).status).toBe(200)
    expect((await api('POST', '/api/v1/bookings', customer.tok, { scheduleId: trip.id, seatNumbers: ['03'], passengers: pax(['03']) })).status).toBe(201)
  })

  it('blocks counter sales for a suspended company even if the seller got past the staff check', async () => {
    const { validateTripForSale, SaleError } = await import('../src/lib/sales')
    const co = await makeCompany('susp2')
    const trip = await newTrip(co)
    await prisma.operator.update({ where: { id: co.operator.id }, data: { status: 'SUSPENDED' } })
    await expect(
      validateTripForSale({ channel: 'COUNTER', scheduleId: trip.id, seatNumbers: ['01'], operatorId: co.operator.id })
    ).rejects.toBeInstanceOf(SaleError)
  })

  it('stops a suspension of a company that does not exist, and a missing id', async () => {
    expect((await api('POST', '/api/v1/admin/operators/nope/suspend', admin.tok, { reason: 'test reason' })).status).toBe(404)
    expect((await api('POST', '/api/v1/admin/operators/nope/reactivate', admin.tok)).status).toBe(404)
    expect((await api('GET', '/api/v1/admin/operators/nope', admin.tok)).status).toBe(404)
  })

  // ─── Demo companies ─────────────────────────────────────
  it('hides a demo company from passengers and refuses online bookings, but still allows counter sales', async () => {
    const co = await makeCompany('demo', { isDemo: true })
    const trip = await newTrip(co)
    expect(await searchFor(trip.departureTime)).not.toContain(trip.id)
    expect((await api('GET', '/api/v1/schedules')).body.data.schedules.map((x: any) => x.id)).not.toContain(trip.id)
    const online = await api('POST', '/api/v1/bookings', customer.tok, { scheduleId: trip.id, seatNumbers: ['01'], passengers: pax(['01']) })
    expect(online.status).toBe(409)
    expect(online.body.error).toMatch(/demo/i)
    expect((await api('GET', `/api/v1/schedules/${trip.id}`)).body.data.schedule.bookable).toBe(false)

    // Staff can still rehearse selling at the counter
    const sale = await api('POST', '/api/v1/counter/sales', co.seller.tok, {
      scheduleId: trip.id, seatNumbers: ['01'], passengerName: 'Test Passenger', passengerPhone: newPhone(), method: 'CASH',
    })
    expect(sale.status).toBe(201)

    // Switching the flag off makes it a normal company again
    await api('PATCH', `/api/v1/admin/operators/${co.operator.id}`, admin.tok, { isDemo: false })
    expect(await searchFor(trip.departureTime)).toContain(trip.id)
    expect((await api('POST', '/api/v1/bookings', customer.tok, { scheduleId: trip.id, seatNumbers: ['02'], passengers: pax(['02']) })).status).toBe(201)
  })

  // ─── Passwords ──────────────────────────────────────────
  it("lets the admin reset a manager's password, and only for staff of that company", async () => {
    const bcrypt = (await import('bcryptjs')).default
    const a = await makeCompany('pw-a')
    const b = await makeCompany('pw-b')
    await prisma.user.update({ where: { id: a.manager.user.id }, data: { password: await bcrypt.hash('oldpass1', 4) } })
    expect((await api('POST', '/api/v1/auth/login', undefined, { phone: a.manager.user.phone, password: 'oldpass1' })).status).toBe(200)

    const out = await api('POST', `/api/v1/admin/operators/${a.operator.id}/staff/${a.manager.staff.id}/password`, admin.tok, { password: 'newpass99' })
    expect(out.status).toBe(200)
    expect((await api('POST', '/api/v1/auth/login', undefined, { phone: a.manager.user.phone, password: 'oldpass1' })).status).toBe(401)
    expect((await api('POST', '/api/v1/auth/login', undefined, { phone: a.manager.user.phone, password: 'newpass99' })).status).toBe(200)

    expect((await api('POST', `/api/v1/admin/operators/${a.operator.id}/staff/${a.manager.staff.id}/password`, admin.tok, { password: '123' })).status).toBe(400)
    // company B's manager can't be reached through company A's URL
    expect((await api('POST', `/api/v1/admin/operators/${a.operator.id}/staff/${b.manager.staff.id}/password`, admin.tok, { password: 'newpass99' })).status).toBe(404)
    // and nobody but the admin can use it
    expect((await api('POST', `/api/v1/admin/operators/${a.operator.id}/staff/${a.seller.staff.id}/password`, a.manager.tok, { password: 'newpass99' })).status).toBe(403)
  })

  // ─── Lists, dashboard and attention ─────────────────────
  it('lists companies with their manager, buses, trips and last-30-day sales', async () => {
    const co = await makeCompany('list')
    const trip = await newTrip(co)
    await api('POST', '/api/v1/counter/sales', co.seller.tok, {
      scheduleId: trip.id, seatNumbers: ['01', '02'], passengerName: 'Walk In', passengerPhone: newPhone(), method: 'CASH',
    })
    const list = await api('GET', '/api/v1/admin/operators', admin.tok)
    const row = list.body.data.operators.find((o: any) => o.id === co.operator.id)
    expect(row).toMatchObject({ buses: 1, activeStaff: 3, upcomingTrips: 1, status: 'ACTIVE', commissionPercent: 5 })
    expect(row.manager.phone).toBe(co.manager.user.phone)
    expect(row.counter30).toEqual({ tickets: 1, total: 200 })
    expect(row.online30).toEqual({ tickets: 0, total: 0 })

    const detail = await api('GET', `/api/v1/admin/operators/${co.operator.id}`, admin.tok)
    expect(detail.body.data.operator.staff).toHaveLength(3)
    expect(detail.body.data.operator.staff.map((s: any) => s.role).sort()).toEqual(['CHECKER', 'MANAGER', 'SELLER'])
    expect(JSON.stringify(detail.body)).not.toContain('"password"')
  })

  it('shows a dashboard that leaves demo companies out and copes with walk-in bookings', async () => {
    const before = (await api('GET', '/api/v1/admin/dashboard', admin.tok)).body.data
    const real = await makeCompany('dash-real')
    const demo = await makeCompany('dash-demo', { isDemo: true })
    const realTrip = await newTrip(real)
    const demoTrip = await newTrip(demo)
    const walkIn = (trip: any) => api('POST', '/api/v1/counter/sales', real.seller.tok, {
      scheduleId: trip.id, seatNumbers: ['01'], passengerName: 'Dash Walker', passengerPhone: newPhone(), method: 'CASH',
    })
    expect((await walkIn(realTrip)).status).toBe(201)
    await api('POST', '/api/v1/counter/sales', demo.seller.tok, {
      scheduleId: demoTrip.id, seatNumbers: ['01'], passengerName: 'Demo Walker', passengerPhone: newPhone(), method: 'CASH',
    })
    // An online confirmed booking
    const online = await api('POST', '/api/v1/bookings', customer.tok, { scheduleId: realTrip.id, seatNumbers: ['05'], passengers: pax(['05']) })
    await prisma.booking.update({ where: { id: online.body.data.booking.id }, data: { status: 'CONFIRMED' } })

    const after = (await api('GET', '/api/v1/admin/dashboard', admin.tok)).body.data
    expect(after.today.counter.tickets - before.today.counter.tickets).toBe(1) // the demo sale is not counted
    expect(after.today.counter.total - before.today.counter.total).toBe(100)
    expect(after.today.online.tickets - before.today.online.tickets).toBe(1)
    expect(after.last30.online.total - before.last30.online.total).toBe(100)
    expect(after.companies.demo).toBeGreaterThanOrEqual(1)
    expect(after.passengers).toBeGreaterThanOrEqual(1)
    expect(after.upcomingTrips - before.upcomingTrips).toBe(1) // the demo trip is not counted
    // The walk-in booking (no account) shows with its own name
    const names = after.recentBookings.map((b: any) => b.passengerName)
    expect(names).toContain('Dash Walker')
    expect(after.recentBookings.every((b: any) => b.companyName !== demo.operator.companyName)).toBe(true)
  })

  it('lists what needs attention: paid-but-cancelled bookings, companies without a manager, buses or trips', async () => {
    const noManager = await makeCompany('att-nomgr')
    await prisma.operatorStaff.update({ where: { id: noManager.manager.staff.id }, data: { active: false } })
    const noBus = await prisma.operator.create({ data: { companyName: `${tag} att-nobus`, licenseNo: newLicense(), phone: '0900000000' } })
    created.operators.add(noBus.id)
    await prisma.operatorStaff.create({ data: { userId: (await makeUser('att-nobus manager', 'OPERATOR')).user.id, operatorId: noBus.id, role: 'MANAGER' } })
    const noTrips = await makeCompany('att-notrips') // has a bus, no trips
    const suspended = await makeCompany('att-susp', { status: 'SUSPENDED', suspendedReason: 'overdue' })
    const demo = await makeCompany('att-demo', { isDemo: true }) // not expected to be complete

    // A passenger paid online but the seat was lost
    const refundCo = await makeCompany('att-refund')
    const trip = await newTrip(refundCo)
    const lost = await prisma.booking.create({
      data: {
        userId: customer.user.id, scheduleId: trip.id, seatNumbers: ['01'], totalPrice: 250, status: 'CANCELLED',
        qrCode: `${tag}-qr-lost`, payment: { create: { amount: 250, method: 'TELEBIRR', status: 'SUCCESS' } },
      },
    })

    const items = (await api('GET', '/api/v1/admin/attention', admin.tok)).body.data.items as any[]
    const has = (kind: string, operatorId: string) => items.some((i) => i.kind === kind && i.operatorId === operatorId)
    expect(items.some((i) => i.kind === 'REFUND_NEEDED' && i.bookingId === lost.id)).toBe(true)
    expect(has('NO_MANAGER', noManager.operator.id)).toBe(true)
    expect(has('NO_BUSES', noBus.id)).toBe(true)
    expect(has('NO_UPCOMING_TRIPS', noTrips.operator.id)).toBe(true)
    expect(has('SUSPENDED', suspended.operator.id)).toBe(true)
    expect(items.some((i) => i.operatorId === demo.operator.id)).toBe(false)
    // A company with trips and a manager has nothing to report
    expect(items.some((i) => i.operatorId === refundCo.operator.id && i.kind !== 'REFUND_NEEDED')).toBe(false)
    // Most urgent first
    const rank = { high: 0, medium: 1, info: 2 } as Record<string, number>
    const ranks = items.map((i) => rank[i.severity])
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    // A cancelled, unpaid booking is not a refund
    const unpaid = await prisma.booking.create({
      data: { userId: customer.user.id, scheduleId: trip.id, seatNumbers: ['02'], totalPrice: 100, status: 'CANCELLED', qrCode: `${tag}-qr-unpaid` },
    })
    const again = (await api('GET', '/api/v1/admin/attention', admin.tok)).body.data.items as any[]
    expect(again.some((i) => i.bookingId === unpaid.id)).toBe(false)
  })
})
