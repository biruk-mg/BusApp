/**
 * Database tests for the home page (Patch H1): the public home data (city lists,
 * popular routes with real prices, real counts) and the offers banner admin.
 * Through the REAL routes over HTTP.
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

async function makeUser(label: string, role: 'CUSTOMER' | 'ADMIN') {
  const user = await prisma.user.create({ data: { name: `${tag} ${label}`, phone: newPhone(), password: 'x', role } })
  created.users.add(user.id)
  return { user, tok: token(user.id, role) }
}

async function makeCompany(label: string, over: Record<string, unknown> = {}) {
  const operator = await prisma.operator.create({
    data: { companyName: `${tag} ${label}`, licenseNo: newLicense(), phone: '0900000000', ...over },
  })
  created.operators.add(operator.id)
  const bus = await prisma.bus.create({ data: { operatorId: operator.id, plateNumber: `${tag}-${label}-1`, totalSeats: 10 } })
  return { operator, bus }
}

let tripCounter = 0
async function newTrip(routeId: string, busId: string, price: number, hoursAhead = 48, over: Record<string, unknown> = {}) {
  const dep = new Date(Date.now() + hoursAhead * 3600 * 1000 + tripCounter++ * 60000)
  return prisma.schedule.create({
    data: { routeId, busId, departureTime: dep, arrivalTime: new Date(dep.getTime() + 7200000), price, ...over },
  })
}

const day = 24 * 3600 * 1000
const iso = (ms: number) => new Date(Date.now() + ms).toISOString()
const mine = (list: any[]) => list.filter((b) => String(b.title).startsWith(tag))

let admin: { user: any; tok: string }, customer: { user: any; tok: string }

describe.skipIf(!TEST_URL)('home page data and offers banner (database, real routes)', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    const app = express()
    app.use(express.json())
    app.use('/api/v1/admin', (await import('../src/routes/admin.routes')).default)
    app.use('/api/v1/public', (await import('../src/routes/public.routes')).default)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    admin = await makeUser('admin', 'ADMIN')
    customer = await makeUser('passenger', 'CUSTOMER')
  })

  afterAll(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
    if (prisma) {
      await prisma.banner.deleteMany({ where: { title: { startsWith: tag } } })
      const buses = await prisma.bus.findMany({ where: { operatorId: { in: [...created.operators] } }, select: { id: true } })
      await prisma.schedule.deleteMany({ where: { busId: { in: buses.map((b) => b.id) } } })
      await prisma.bus.deleteMany({ where: { id: { in: buses.map((b) => b.id) } } })
      await prisma.route.deleteMany({ where: { id: { in: created.routes } } })
      await prisma.operator.deleteMany({ where: { id: { in: [...created.operators] } } })
      await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } })
      await prisma.$disconnect()
    }
  })

  // ─── Home data: routes, popular routes, stats ───────────
  describe('home data', () => {
    it('lists every route for the city dropdowns, even one with no trips yet', async () => {
      const lonely = await prisma.route.create({ data: { fromCity: `${tag}-Lonely`, toCity: `${tag}-Nowhere`, distanceKm: 50, estimatedDurationMin: 60 } })
      created.routes.push(lonely.id)
      const out = await api('GET', '/api/v1/public/home')
      expect(out.status).toBe(200)
      expect(out.body.data.routes).toContainEqual({ fromCity: `${tag}-Lonely`, toCity: `${tag}-Nowhere` })
      // ...but a route nobody runs is not "popular"
      expect(out.body.data.popular.find((p: any) => p.fromCity === `${tag}-Lonely`)).toBeUndefined()
    })

    it('shows the cheapest real price, the operator count and the next departure for a route', async () => {
      const route = await prisma.route.create({ data: { fromCity: `${tag}-A`, toCity: `${tag}-B`, distanceKm: 300, estimatedDurationMin: 240 } })
      created.routes.push(route.id)
      const co1 = await makeCompany('pop1')
      const co2 = await makeCompany('pop2')
      await newTrip(route.id, co1.bus.id, 500, 72)
      const soonest = await newTrip(route.id, co1.bus.id, 450, 24)
      await newTrip(route.id, co2.bus.id, 380, 48)
      const out = await api('GET', '/api/v1/public/home')
      const card = out.body.data.popular.find((p: any) => p.fromCity === `${tag}-A`)
      expect(card).toBeTruthy()
      expect(card.toCity).toBe(`${tag}-B`)
      expect(card.minPrice).toBe(380)
      expect(card.tripCount).toBe(3)
      expect(card.operatorCount).toBe(2)
      expect(card.durationMin).toBe(240)
      expect(new Date(card.nextDeparture).getTime()).toBe(soonest.departureTime.getTime())
    })

    it('ignores closed trips, past trips, and trips of suspended or demo companies', async () => {
      const route = await prisma.route.create({ data: { fromCity: `${tag}-C`, toCity: `${tag}-D`, distanceKm: 100, estimatedDurationMin: 90 } })
      created.routes.push(route.id)
      const good = await makeCompany('good')
      const suspended = await makeCompany('susp', { status: 'SUSPENDED' })
      const demo = await makeCompany('demo', { isDemo: true })
      await newTrip(route.id, good.bus.id, 300, 24)
      await newTrip(route.id, good.bus.id, 100, 30, { status: 'CLOSED' })
      await newTrip(route.id, good.bus.id, 90, -5) // already left
      await newTrip(route.id, suspended.bus.id, 80, 24)
      await newTrip(route.id, demo.bus.id, 70, 24)
      const card = (await api('GET', '/api/v1/public/home')).body.data.popular.find((p: any) => p.fromCity === `${tag}-C`)
      expect(card.minPrice).toBe(300)
      expect(card.tripCount).toBe(1)
      expect(card.operatorCount).toBe(1)
    })

    it('only counts trips in the next 30 days for popular routes', async () => {
      const route = await prisma.route.create({ data: { fromCity: `${tag}-E`, toCity: `${tag}-F`, distanceKm: 100, estimatedDurationMin: 90 } })
      created.routes.push(route.id)
      const co = await makeCompany('far')
      await newTrip(route.id, co.bus.id, 200, 24 * 40)
      const out = await api('GET', '/api/v1/public/home')
      expect(out.body.data.popular.find((p: any) => p.fromCity === `${tag}-E`)).toBeUndefined()
    })

    it('reports real counts that go up when real things are added', async () => {
      const before = (await api('GET', '/api/v1/public/home')).body.data.stats
      const route = await prisma.route.create({ data: { fromCity: `${tag}-G`, toCity: `${tag}-H`, distanceKm: 100, estimatedDurationMin: 90 } })
      created.routes.push(route.id)
      const co = await makeCompany('count')
      await makeCompany('count-demo', { isDemo: true }) // must not be counted
      await newTrip(route.id, co.bus.id, 200, 24)
      await newTrip(route.id, co.bus.id, 210, 26)
      const after = (await api('GET', '/api/v1/public/home')).body.data.stats
      expect(after.routes).toBe(before.routes + 1)
      expect(after.companies).toBe(before.companies + 1)
      expect(after.upcomingTrips).toBe(before.upcomingTrips + 2)
    })

    it('needs no login', async () => {
      expect((await api('GET', '/api/v1/public/home')).status).toBe(200)
    })
  })

  // ─── Offers banner ───────────────────────────────────────
  describe('offers banner', () => {
    it('lets only the platform admin manage banners', async () => {
      const paths: [string, string, unknown?][] = [
        ['GET', '/api/v1/admin/banners'],
        ['POST', '/api/v1/admin/banners', { title: `${tag} nope` }],
        ['PATCH', '/api/v1/admin/banners/x', { title: 'x' }],
        ['DELETE', '/api/v1/admin/banners/x'],
      ]
      for (const [m, p, b] of paths) {
        expect((await api(m, p, undefined, b)).status).toBe(401)
        expect((await api(m, p, customer.tok, b)).status).toBe(403)
      }
      expect((await prisma.banner.count({ where: { title: `${tag} nope` } }))).toBe(0)
    })

    it('creates a banner with sensible defaults and turns blank fields into nothing', async () => {
      const out = await api('POST', '/api/v1/admin/banners', admin.tok, { title: `${tag} basic`, message: 'Hello', badge: '', linkText: '', linkUrl: '' })
      expect(out.status).toBe(201)
      const b = out.body.data.banner
      expect(b.active).toBe(true)
      expect(b.theme).toBe('red')
      expect(b.badge).toBeNull()
      expect(b.linkUrl).toBeNull()
      expect(b.startsAt).toBeNull()
    })

    it('rejects unsafe or bad input', async () => {
      const bad: Record<string, unknown>[] = [
        { title: '' },
        { title: `${tag} t`.padEnd(100, 'x') },
        { title: `${tag} x`, linkUrl: 'javascript:alert(1)' },
        { title: `${tag} x`, linkUrl: '//evil.example.com' },
        { title: `${tag} x`, linkUrl: 'http://not-secure.example.com' },
        { title: `${tag} x`, linkUrl: 'search' },
        { title: `${tag} x`, theme: 'rainbow' },
        { title: `${tag} x`, message: 'm'.repeat(241) },
        { title: `${tag} x`, startsAt: iso(2 * day), endsAt: iso(1 * day) },
        { title: `${tag} x`, sortOrder: -1 },
      ]
      for (const body of bad) {
        const out = await api('POST', '/api/v1/admin/banners', admin.tok, body)
        expect(out.status, JSON.stringify(body)).toBe(400)
      }
      const ok = await api('POST', '/api/v1/admin/banners', admin.tok, { title: `${tag} links`, linkUrl: '/search?fromCity=Addis%20Ababa', linkText: 'Book' })
      expect(ok.status).toBe(201)
      const ok2 = await api('POST', '/api/v1/admin/banners', admin.tok, { title: `${tag} https`, linkUrl: 'https://t.me/mugobus' })
      expect(ok2.status).toBe(201)
    })

    it('shows only banners that are on and inside their dates, in the chosen order', async () => {
      await prisma.banner.deleteMany({ where: { title: { startsWith: tag } } })
      const make = (extra: Record<string, unknown>) => api('POST', '/api/v1/admin/banners', admin.tok, extra)
      await make({ title: `${tag} second`, sortOrder: 20 })
      await make({ title: `${tag} first`, sortOrder: 10 })
      await make({ title: `${tag} off`, active: false })
      await make({ title: `${tag} future`, startsAt: iso(day) })
      await make({ title: `${tag} expired`, endsAt: iso(-day) })
      await make({ title: `${tag} now`, sortOrder: 30, startsAt: iso(-day), endsAt: iso(day) })
      const shown = mine((await api('GET', '/api/v1/public/home')).body.data.banners).map((b) => b.title.replace(`${tag} `, ''))
      expect(shown).toEqual(['first', 'second', 'now'])
      // the admin still sees all of them
      const all = mine((await api('GET', '/api/v1/admin/banners', admin.tok)).body.data.banners)
      expect(all).toHaveLength(6)
    })

    it('only gives the public the fields it needs', async () => {
      const b = mine((await api('GET', '/api/v1/public/home')).body.data.banners)[0]
      expect(Object.keys(b).sort()).toEqual(['badge', 'id', 'linkText', 'linkUrl', 'message', 'theme', 'title'])
    })

    it('edits a banner, switches it off, and checks the dates against what is saved', async () => {
      const made = await api('POST', '/api/v1/admin/banners', admin.tok, { title: `${tag} edit`, startsAt: iso(day), endsAt: iso(3 * day) })
      const id = made.body.data.banner.id
      expect((await api('PATCH', `/api/v1/admin/banners/${id}`, admin.tok, { title: `${tag} edited`, badge: 'NEW' })).body.data.banner.badge).toBe('NEW')
      // moving only the end date before the saved start date is refused
      expect((await api('PATCH', `/api/v1/admin/banners/${id}`, admin.tok, { endsAt: iso(0) })).status).toBe(400)
      // clearing a date works
      const cleared = await api('PATCH', `/api/v1/admin/banners/${id}`, admin.tok, { startsAt: null, endsAt: null, active: false })
      expect(cleared.body.data.banner.startsAt).toBeNull()
      expect(mine((await api('GET', '/api/v1/public/home')).body.data.banners).find((b) => b.id === id)).toBeUndefined()
      expect((await api('PATCH', '/api/v1/admin/banners/does-not-exist', admin.tok, { title: 'x' })).status).toBe(404)
    })

    it('deletes a banner', async () => {
      const made = await api('POST', '/api/v1/admin/banners', admin.tok, { title: `${tag} bye` })
      const id = made.body.data.banner.id
      expect((await api('DELETE', `/api/v1/admin/banners/${id}`, admin.tok)).status).toBe(200)
      expect(await prisma.banner.findUnique({ where: { id } })).toBeNull()
      expect((await api('DELETE', `/api/v1/admin/banners/${id}`, admin.tok)).status).toBe(404)
    })
  })
})
