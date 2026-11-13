/**
 * Database tests for G2: a login token stays valid for days, so every admin power must
 * be checked against the database, not the token. Here a person whose token still says
 * ADMIN (but who is no longer one, or no longer exists) is refused everywhere, while a
 * real admin still works. Through the REAL routes over HTTP.
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
async function makeUser(label: string, role: 'CUSTOMER' | 'ADMIN') {
  const user = await prisma.user.create({ data: { name: `${tag} ${label}`, phone: newPhone(), password: 'x', role } })
  created.users.add(user.id)
  return { user, tok: token(user.id, role) }
}

let realAdmin: Awaited<ReturnType<typeof makeUser>>
let demoted: Awaited<ReturnType<typeof makeUser>> // token says ADMIN, database says CUSTOMER
let removed: Awaited<ReturnType<typeof makeUser>> // token says ADMIN, the account is gone
let victim: Awaited<ReturnType<typeof makeUser>>
let booking: any
let hiddenTrip: any

describe.skipIf(!TEST_URL)('admin powers are checked in the database (G2)', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    const app = express()
    app.use(express.json())
    app.use('/api/v1/auth', (await import('../src/routes/auth.routes')).default)
    app.use('/api/v1/routes', (await import('../src/routes/route.routes')).default)
    app.use('/api/v1/schedules', (await import('../src/routes/schedule.routes')).default)
    app.use('/api/v1/bookings', (await import('../src/routes/booking.routes')).default)
    app.use('/api/v1/payments', (await import('../src/routes/payment.routes')).default)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    realAdmin = await makeUser('real admin', 'ADMIN')
    demoted = await makeUser('demoted admin', 'ADMIN')
    await prisma.user.update({ where: { id: demoted.user.id }, data: { role: 'CUSTOMER' } })
    removed = await makeUser('removed admin', 'ADMIN')
    await prisma.user.delete({ where: { id: removed.user.id } })
    created.users.delete(removed.user.id)
    victim = await makeUser('victim', 'CUSTOMER')

    const route = await prisma.route.create({ data: { fromCity: `${tag}-A`, toCity: `${tag}-B`, distanceKm: 100, estimatedDurationMin: 120 } })
    created.routes.push(route.id)
    const demo = await prisma.operator.create({
      data: { companyName: `${tag} Demo Co`, licenseNo: `${tag}-L`, phone: '0900000000', isDemo: true },
    })
    created.operators.add(demo.id)
    const bus = await prisma.bus.create({ data: { operatorId: demo.id, plateNumber: `${tag}-B`, totalSeats: 40 } })
    const dep = new Date(Date.now() + 30 * H)
    hiddenTrip = await prisma.schedule.create({
      data: { routeId: route.id, busId: bus.id, departureTime: dep, arrivalTime: new Date(dep.getTime() + 2 * H), price: 100 },
    })
    booking = await prisma.booking.create({
      data: { scheduleId: hiddenTrip.id, userId: victim.user.id, seatNumbers: ['01'], totalPrice: 100, status: 'PENDING', qrCode: `${tag}-1`, expiresAt: new Date(Date.now() + 15 * 60_000) },
    })
  })

  afterAll(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
    if (prisma) {
      const ids = hiddenTrip ? [hiddenTrip.id] : []
      await prisma.payment.deleteMany({ where: { booking: { scheduleId: { in: ids } } } })
      await prisma.booking.deleteMany({ where: { scheduleId: { in: ids } } })
      await prisma.schedule.deleteMany({ where: { id: { in: ids } } })
      await prisma.bus.deleteMany({ where: { operatorId: { in: [...created.operators] } } })
      await prisma.route.deleteMany({ where: { id: { in: created.routes } } })
      await prisma.operator.deleteMany({ where: { id: { in: [...created.operators] } } })
      await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } })
      await prisma.$disconnect()
    }
  })

  const refusedForBoth = async (method: string, path: string, body?: unknown) => {
    for (const who of [demoted, removed]) {
      const res = await api(method, path, who.tok, body)
      expect(res.status, `${method} ${path} for ${who === demoted ? 'a demoted admin' : 'a removed admin'}: ${JSON.stringify(res.body)}`).toBe(403)
    }
  }

  it('refuses a demoted or removed admin on the admin-only lists and actions', async () => {
    await refusedForBoth('GET', '/api/v1/auth/users')
    await refusedForBoth('GET', '/api/v1/bookings')
    await refusedForBoth('POST', '/api/v1/routes', { fromCity: 'X', toCity: 'Y', distanceKm: 1, estimatedDurationMin: 1 })
    await refusedForBoth('DELETE', '/api/v1/routes/anything')
  })

  it('still lets the real admin through on the same routes', async () => {
    expect((await api('GET', '/api/v1/auth/users', realAdmin.tok)).status).toBe(200)
    expect((await api('GET', '/api/v1/bookings', realAdmin.tok)).status).toBe(200)
    const created = await api('POST', '/api/v1/routes', realAdmin.tok, {}) // an empty form: passes the admin check, fails validation
    expect(created.status).not.toBe(403)
    expect(created.status).not.toBe(401)
  })

  it('refuses a demoted or removed admin reading another passenger\'s booking', async () => {
    await refusedForBoth('GET', `/api/v1/bookings/${booking.id}`)
    expect((await api('GET', `/api/v1/bookings/${booking.id}`, realAdmin.tok)).status).toBe(200)
    expect((await api('GET', `/api/v1/bookings/${booking.id}`, victim.tok)).status).toBe(200)
  })

  it('refuses a demoted or removed admin checking another passenger\'s payment', async () => {
    await refusedForBoth('POST', `/api/v1/payments/verify-booking/${booking.id}`)
    expect((await api('POST', `/api/v1/payments/verify-booking/${booking.id}`, realAdmin.tok)).status).toBe(200)
  })

  it('refuses a demoted or removed admin cancelling (with a full refund) another passenger\'s booking', async () => {
    await refusedForBoth('PATCH', `/api/v1/bookings/${booking.id}/cancel`)
    await refusedForBoth('GET', `/api/v1/bookings/${booking.id}/refund-preview`)
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))!.status).toBe('PENDING')
  })

  it('does not show hidden (demo or suspended) companies\' trips to a demoted admin, but does to the real one', async () => {
    const ids = async (tok?: string) =>
      ((await api('GET', '/api/v1/schedules?includeHidden=true&includePast=true', tok)).body.data.schedules as any[]).map((s) => s.id)
    expect(await ids(realAdmin.tok)).toContain(hiddenTrip.id)
    expect(await ids(demoted.tok)).not.toContain(hiddenTrip.id)
    expect(await ids(removed.tok)).not.toContain(hiddenTrip.id)
    expect(await ids()).not.toContain(hiddenTrip.id)
  })

  it('lets the real admin cancel a passenger\'s booking, as before (a full refund)', async () => {
    const out = await api('PATCH', `/api/v1/bookings/${booking.id}/cancel`, realAdmin.tok)
    expect(out.status, JSON.stringify(out.body)).toBe(200)
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))!.status).toBe('CANCELLED')
  })
})
