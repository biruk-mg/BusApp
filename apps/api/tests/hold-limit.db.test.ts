/**
 * Database tests for the unpaid-seats limit (Patch G1): one account can hold at most
 * 10 unpaid seats at the same time, across all trips, so nobody can keep real
 * passengers out by booking seats they never pay for.
 *
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

// Online bookings need a name for every seat
const pax = (seats: string[]) => seats.map((s) => ({ seatNumber: s, name: `Test Passenger ${s}` }))

type Prisma = typeof import('../src/lib/prisma').prisma
let prisma: Prisma
let server: http.Server
let baseUrl = ''

const tag = `TEST-${Date.now()}`
let phoneCounter = 0
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

const created = { users: [] as string[], operatorId: '', routeId: '', tripIds: [] as string[], busId: '' }

async function makeCustomer(label: string) {
  const user = await prisma.user.create({ data: { name: `${tag} ${label}`, phone: newPhone(), password: 'x', role: 'CUSTOMER' } })
  created.users.push(user.id)
  return { user, tok: token(user.id, 'CUSTOMER') }
}

const seats = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => String(from + i).padStart(2, '0'))

let trips: { id: string }[] = []

/** A passenger asks for seats on trip number `n` (0, 1, 2...). */
const book = (tok: string, n: number, seatNumbers: string[]) =>
  api('POST', '/api/v1/bookings', tok, { scheduleId: trips[n].id, seatNumbers, passengers: pax(seatNumbers) })

describe.skipIf(!TEST_URL)('unpaid seats limit (database, real routes)', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    const app = express()
    app.use(express.json())
    app.use('/api/v1/bookings', (await import('../src/routes/booking.routes')).default)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const route = await prisma.route.create({ data: { fromCity: `${tag}-From`, toCity: `${tag}-To`, distanceKm: 100, estimatedDurationMin: 120 } })
    created.routeId = route.id
    const operator = await prisma.operator.create({
      data: { companyName: `${tag} Co`, licenseNo: `${tag}-L`, phone: '0900000000' },
    })
    created.operatorId = operator.id
    const bus = await prisma.bus.create({ data: { operatorId: operator.id, plateNumber: `${tag}-BUS`, totalSeats: 40 } })
    created.busId = bus.id
    // Four different trips, so "holding seats on many trips" can really be tested
    for (let i = 0; i < 4; i++) {
      const dep = new Date(Date.now() + (5 + i) * 3600 * 1000)
      const trip = await prisma.schedule.create({
        data: { routeId: route.id, busId: bus.id, departureTime: dep, arrivalTime: new Date(dep.getTime() + 7200000), price: 100 },
      })
      trips.push(trip)
      created.tripIds.push(trip.id)
    }
  })

  afterAll(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
    if (prisma) {
      await prisma.booking.deleteMany({ where: { scheduleId: { in: created.tripIds } } })
      await prisma.schedule.deleteMany({ where: { id: { in: created.tripIds } } })
      if (created.busId) await prisma.bus.deleteMany({ where: { id: created.busId } })
      if (created.routeId) await prisma.route.deleteMany({ where: { id: created.routeId } })
      if (created.operatorId) await prisma.operator.deleteMany({ where: { id: created.operatorId } })
      await prisma.user.deleteMany({ where: { id: { in: created.users } } })
      await prisma.$disconnect()
    }
  })

  it('lets a passenger hold up to 10 unpaid seats across trips, and refuses the 11th', async () => {
    const p = await makeCustomer('holder')
    expect((await book(p.tok, 0, seats(1, 6))).status).toBe(201)
    expect((await book(p.tok, 1, seats(1, 4))).status).toBe(201) // 6 + 4 = 10
    const over = await book(p.tok, 2, ['01'])
    expect(over.status).toBe(409)
    expect(over.body.error).toMatch(/10/)
    expect(over.body.error).toMatch(/not paid/i)
    // Nothing was created for the refused request
    expect(await prisma.booking.count({ where: { userId: p.user.id } })).toBe(2)
  })

  it('does not count the limit against other passengers', async () => {
    const hoarder = await makeCustomer('hoarder')
    expect((await book(hoarder.tok, 0, seats(10, 19))).status).toBe(201) // 10 seats
    expect((await book(hoarder.tok, 1, ['20'])).status).toBe(409)

    const other = await makeCustomer('other')
    expect((await book(other.tok, 1, ['20'])).status).toBe(201)
  })

  it('frees the allowance when the passenger cancels an unpaid booking', async () => {
    const p = await makeCustomer('canceller')
    const first = await book(p.tok, 2, seats(1, 10))
    expect(first.status).toBe(201)
    expect((await book(p.tok, 3, ['01'])).status).toBe(409)

    const cancelled = await api('PATCH', `/api/v1/bookings/${first.body.data.booking.id}/cancel`, p.tok)
    expect(cancelled.status).toBe(200)
    expect((await book(p.tok, 3, ['01'])).status).toBe(201)
  })

  it('does not count paid bookings or holds that ran out', async () => {
    const p = await makeCustomer('payer')
    const a = await book(p.tok, 3, seats(10, 14)) // 5 seats
    const b = await book(p.tok, 2, seats(20, 24)) // 5 seats: now at the limit
    expect(a.status).toBe(201)
    expect(b.status).toBe(201)
    expect((await book(p.tok, 0, ['30'])).status).toBe(409)

    // One booking gets paid: those 5 seats no longer count as "unpaid"
    await prisma.booking.update({ where: { id: a.body.data.booking.id }, data: { status: 'CONFIRMED', expiresAt: null } })
    expect((await book(p.tok, 0, ['30'])).status).toBe(201) // 5 (unpaid) + 1

    // The other one runs out of time: it stops counting too
    await prisma.booking.update({ where: { id: b.body.data.booking.id }, data: { expiresAt: new Date(Date.now() - 60 * 1000) } })
    expect((await book(p.tok, 0, seats(31, 39))).status).toBe(201) // 1 (unpaid) + 9 = 10
    expect((await book(p.tok, 1, ['40'])).status).toBe(409)
  })

  it('keeps the limit when many requests arrive at the same moment', async () => {
    const p = await makeCustomer('racer')
    // Six requests of 4 free seats each, all at once: exactly 2 fit (8 <= 10), a third would make 12 > 10.
    // The seats are all different, so a refusal can only come from the limit.
    const requests: [number, string[]][] = [
      [1, seats(21, 24)],
      [1, seats(25, 28)],
      [2, seats(30, 33)],
      [2, seats(34, 37)],
      [3, seats(20, 23)],
      [3, seats(24, 27)],
    ]
    const results = await Promise.all(requests.map(([n, s]) => book(p.tok, n, s)))
    expect(results.filter((r) => r.status === 201)).toHaveLength(2)
    expect(results.filter((r) => r.status === 409)).toHaveLength(4)
    const rows = await prisma.booking.findMany({ where: { userId: p.user.id, status: 'PENDING' } })
    expect(rows.flatMap((b) => b.seatNumbers)).toHaveLength(8)
  })
})
