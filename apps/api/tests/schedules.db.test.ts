/**
 * Database tests for recurring schedules, closing and pausing.
 *
 * They only run when TEST_DATABASE_URL is set, and they refuse to run if it
 * is the same database as DATABASE_URL, so they can't touch your live data.
 * They create their own rows (marked "TEST-") and remove them afterwards.
 *
 *   TEST_DATABASE_URL="postgresql://..." pnpm test
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import dotenv from 'dotenv'

dotenv.config({ path: '../../.env' })
const TEST_URL = process.env.TEST_DATABASE_URL
const NORMAL_URL = process.env.DATABASE_URL

if (TEST_URL && NORMAL_URL && TEST_URL === NORMAL_URL) {
  throw new Error('TEST_DATABASE_URL is the same as DATABASE_URL. Use a separate database or Neon branch.')
}
if (TEST_URL) process.env.DATABASE_URL = TEST_URL

type Prisma = typeof import('../src/lib/prisma').prisma
let prisma: Prisma
let lib: typeof import('../src/lib/recurring')
let time: typeof import('../src/lib/time')
let schedCtl: typeof import('../src/controllers/schedule.controller')
let bookCtl: typeof import('../src/controllers/booking.controller')
let tplCtl: typeof import('../src/controllers/template.controller')

const tag = `TEST-${Date.now()}`
const ids = { operators: [] as string[], users: [] as string[], buses: [] as string[], routes: [] as string[] }

function mockRes() {
  const out: { status: number; body: any } = { status: 200, body: undefined }
  const res: any = {
    status(code: number) { out.status = code; return res },
    json(body: any) { out.body = body; return res },
  }
  return { res, out }
}
const call = async (fn: Function, req: any) => {
  const { res, out } = mockRes()
  await fn(req, res)
  return out
}

// Two operators, three buses for the first one, one route (6 hours long)
let operatorA: any, operatorB: any, userA: any, userB: any, customer: any, route: any
let bus1: any, bus2: any, bus3: any, busOfB: any

async function makeBus(operatorId: string, n: string) {
  const bus = await prisma.bus.create({ data: { operatorId, plateNumber: `${tag}-${n}`, totalSeats: 10 } })
  ids.buses.push(bus.id)
  return bus
}

async function cleanup() {
  if (!prisma) return
  const schedules = await prisma.schedule.findMany({ where: { busId: { in: ids.buses } }, select: { id: true } })
  const scheduleIds = schedules.map((s) => s.id)
  await prisma.payment.deleteMany({ where: { booking: { scheduleId: { in: scheduleIds } } } })
  await prisma.booking.deleteMany({ where: { scheduleId: { in: scheduleIds } } })
  await prisma.schedule.deleteMany({ where: { id: { in: scheduleIds } } })
  await prisma.scheduleTemplate.deleteMany({ where: { busId: { in: ids.buses } } })
  await prisma.bus.deleteMany({ where: { id: { in: ids.buses } } })
  await prisma.route.deleteMany({ where: { id: { in: ids.routes } } })
  await prisma.operator.deleteMany({ where: { id: { in: ids.operators } } })
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
}

describe.skipIf(!TEST_URL)('recurring schedules (database)', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    lib = await import('../src/lib/recurring')
    time = await import('../src/lib/time')
    schedCtl = await import('../src/controllers/schedule.controller')
    bookCtl = await import('../src/controllers/booking.controller')
    tplCtl = await import('../src/controllers/template.controller')

    // Search starts a background top-up of ALL active templates the first time it
    // is used. Start (and finish) it now, before the fixtures exist, so it can't
    // interfere with the tests below.
    lib.maybeTopUp()
    await new Promise((r) => setTimeout(r, 1000))

    userA = await prisma.user.create({ data: { name: 'A', phone: `${tag}-0001`, password: 'x', role: 'OPERATOR' } })
    userB = await prisma.user.create({ data: { name: 'B', phone: `${tag}-0002`, password: 'x', role: 'OPERATOR' } })
    customer = await prisma.user.create({ data: { name: 'C', phone: `${tag}-0003`, password: 'x' } })
    ids.users.push(userA.id, userB.id, customer.id)
    operatorA = await prisma.operator.create({ data: { companyName: `${tag} A`, licenseNo: `${tag}-A`, phone: userA.phone } })
    operatorB = await prisma.operator.create({ data: { companyName: `${tag} B`, licenseNo: `${tag}-B`, phone: userB.phone } })
    ids.operators.push(operatorA.id, operatorB.id)
    // The staff middleware puts the company on the request; these tests call the
    // controllers directly, so they pass operatorId themselves (see staff.db.test.ts
    // for the real routes and middleware).
    route = await prisma.route.create({
      data: { fromCity: `${tag}-From`, toCity: `${tag}-To`, distanceKm: 200, estimatedDurationMin: 360 },
    })
    ids.routes.push(route.id)
    bus1 = await makeBus(operatorA.id, '1')
    bus2 = await makeBus(operatorA.id, '2')
    bus3 = await makeBus(operatorA.id, '3')
    busOfB = await makeBus(operatorB.id, 'B')
  })

  afterAll(async () => {
    await cleanup()
    await prisma?.$disconnect()
  })

  const makeTemplate = (busId: string, departureTime: string, daysOfWeek = [0, 1, 2, 3, 4, 5, 6]) =>
    prisma.scheduleTemplate.create({ data: { busId, routeId: route.id, departureTime, price: 300, daysOfWeek } })

  const tripsOf = (templateId: string) =>
    prisma.schedule.findMany({ where: { templateId }, orderBy: { departureTime: 'asc' } })

  it('generates trips at the right Addis time and never twice', async () => {
    const t = await makeTemplate(bus1.id, '05:00')
    const first = await lib.generateForTemplate(t)
    const count = (await tripsOf(t.id)).length
    expect(count).toBeGreaterThanOrEqual(29)
    expect(count).toBeLessThanOrEqual(30)
    expect(first.created).toBe(count)

    const second = await lib.generateForTemplate(t)
    expect(second.created).toBe(0)
    expect(await tripsOf(t.id)).toHaveLength(count)

    // Two runs at the same time still give no duplicates
    await Promise.all([lib.generateForTemplate(t), lib.generateForTemplate(t), lib.generateForTemplate(t)])
    expect(await tripsOf(t.id)).toHaveLength(count)

    for (const trip of await tripsOf(t.id)) {
      expect(time.addisTimeString(trip.departureTime)).toBe('05:00')
      expect(trip.arrivalTime.getTime() - trip.departureTime.getTime()).toBe(360 * 60 * 1000)
      expect(trip.status).toBe('OPEN')
    }
  })

  it('has a database rule that blocks a second trip for the same template and time', async () => {
    const t = await prisma.scheduleTemplate.findFirstOrThrow({ where: { busId: bus1.id } })
    const [trip] = await tripsOf(t.id)
    await expect(
      prisma.schedule.create({
        data: {
          routeId: route.id, busId: bus2.id, departureTime: trip.departureTime,
          arrivalTime: trip.arrivalTime, price: 1, templateId: t.id,
        },
      })
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('only creates trips on the chosen weekdays', async () => {
    const t = await makeTemplate(bus2.id, '08:00', [1, 3]) // Monday and Wednesday
    await lib.generateForTemplate(t)
    const trips = await tripsOf(t.id)
    expect(trips.length).toBeGreaterThan(0)
    for (const trip of trips) {
      expect([1, 3]).toContain(time.weekdayOfDateString(time.addisDateString(trip.departureTime)))
    }
  })

  it('refuses to put a second trip on a bus that is busy, and still creates the rest', async () => {
    const t = await makeTemplate(bus3.id, '05:00')
    // A one-off trip already on bus 3 around 07:00 in 3 days
    const day = time.addDaysToDateString(time.addisDateString(new Date()), 3)
    const busyFrom = time.addisToUtc(day, '07:00')
    await prisma.schedule.create({
      data: {
        routeId: route.id, busId: bus3.id, departureTime: busyFrom,
        arrivalTime: new Date(busyFrom.getTime() + 60 * 60 * 1000), price: 100,
      },
    })
    const result = await lib.generateForTemplate(t)
    expect(result.skipped.map((s) => s.date)).toContain(day)
    expect(result.created).toBeGreaterThan(20)
    const onThatDay = (await tripsOf(t.id)).filter((x) => time.addisDateString(x.departureTime) === day)
    expect(onThatDay).toHaveLength(0)
  })

  it('does not recreate a trip the operator closed', async () => {
    const t = await prisma.scheduleTemplate.findFirstOrThrow({ where: { busId: bus1.id } })
    const [trip] = await tripsOf(t.id)
    const closed = await call(schedCtl.setScheduleStatus, {
      userId: userA.id, userRole: 'OPERATOR', operatorId: operatorA.id, staffRole: 'MANAGER', params: { id: trip.id }, body: { status: 'CLOSED' },
    })
    expect(closed.status).toBe(200)
    await lib.generateForTemplate(t)
    const again = await prisma.schedule.findUniqueOrThrow({ where: { id: trip.id } })
    expect(again.status).toBe('CLOSED')
    expect(await prisma.schedule.count({ where: { templateId: t.id, departureTime: trip.departureTime } })).toBe(1)

    const reopened = await call(schedCtl.setScheduleStatus, {
      userId: userA.id, userRole: 'OPERATOR', operatorId: operatorA.id, staffRole: 'MANAGER', params: { id: trip.id }, body: { status: 'OPEN' },
    })
    expect(reopened.status).toBe(200)
  })

  it("stops another operator from closing or deleting someone else's trip", async () => {
    const trip = await prisma.schedule.findFirstOrThrow({ where: { busId: bus1.id } })
    const closed = await call(schedCtl.setScheduleStatus, {
      userId: userB.id, userRole: 'OPERATOR', operatorId: operatorB.id, staffRole: 'MANAGER', params: { id: trip.id }, body: { status: 'CLOSED' },
    })
    expect(closed.status).toBe(403)
    const deleted = await call(schedCtl.deleteSchedule, { userId: userB.id, userRole: 'OPERATOR', operatorId: operatorB.id, staffRole: 'MANAGER', params: { id: trip.id } })
    expect(deleted.status).toBe(403)
  })

  it('does not let a generated trip be deleted (it would just be recreated)', async () => {
    const trip = await prisma.schedule.findFirstOrThrow({ where: { busId: bus1.id } })
    const out = await call(schedCtl.deleteSchedule, { userId: userA.id, userRole: 'OPERATOR', operatorId: operatorA.id, staffRole: 'MANAGER', params: { id: trip.id } })
    expect(out.status).toBe(409)
  })

  it('rejects new bookings on a closed trip and accepts them on an open one', async () => {
    const trip = await prisma.schedule.findFirstOrThrow({
      where: { busId: bus2.id, departureTime: { gt: new Date() } }, orderBy: { departureTime: 'asc' },
    })
    await prisma.schedule.update({ where: { id: trip.id }, data: { status: 'CLOSED' } })
    const rejected = await call(bookCtl.createBooking, {
      userId: customer.id, body: { scheduleId: trip.id, seatNumbers: ['01'] },
    })
    expect(rejected.status).toBe(409)
    expect(rejected.body.error).toMatch(/closed/i)
    expect(await prisma.booking.count({ where: { scheduleId: trip.id } })).toBe(0)

    await prisma.schedule.update({ where: { id: trip.id }, data: { status: 'OPEN' } })
    const accepted = await call(bookCtl.createBooking, {
      userId: customer.id, body: { scheduleId: trip.id, seatNumbers: ['01'] },
    })
    expect(accepted.status).toBe(201)
  })

  it('keeps an existing booking when its trip is closed', async () => {
    const booking = await prisma.booking.findFirstOrThrow({ where: { userId: customer.id } })
    await call(schedCtl.setScheduleStatus, {
      userId: userA.id, userRole: 'OPERATOR', operatorId: operatorA.id, staffRole: 'MANAGER', params: { id: booking.scheduleId }, body: { status: 'CLOSED' },
    })
    const still = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
    expect(still.status).toBe('PENDING')
    await prisma.schedule.update({ where: { id: booking.scheduleId }, data: { status: 'OPEN' } })
  })

  it('hides closed trips from search', async () => {
    const day = time.addDaysToDateString(time.addisDateString(new Date()), 5)
    const trips = await prisma.schedule.findMany({
      where: { busId: bus1.id, departureTime: { gte: time.addisDayRange(day).start, lt: time.addisDayRange(day).end } },
    })
    expect(trips).toHaveLength(1)
    const query = { fromCity: `${tag}-From`, toCity: `${tag}-To`, date: day }

    let out = await call(schedCtl.searchSchedules, { query })
    expect(out.body.data.schedules.map((s: any) => s.id)).toContain(trips[0].id)

    await prisma.schedule.update({ where: { id: trips[0].id }, data: { status: 'CLOSED' } })
    out = await call(schedCtl.searchSchedules, { query })
    expect(out.body.data.schedules.map((s: any) => s.id)).not.toContain(trips[0].id)
    await prisma.schedule.update({ where: { id: trips[0].id }, data: { status: 'OPEN' } })
  })

  it('files trips around midnight Addis time under the right day', async () => {
    const day = time.addDaysToDateString(time.addisDateString(new Date()), 12)
    const nextDay = time.addDaysToDateString(day, 1)
    const mk = (date: string, clock: string) => {
      const dep = time.addisToUtc(date, clock)
      return prisma.schedule.create({
        data: { routeId: route.id, busId: busOfB.id, departureTime: dep, arrivalTime: new Date(dep.getTime() + 3600000), price: 100 },
      })
    }
    const late = await mk(day, '23:30')   // 20:30 UTC, same date in UTC
    const early = await mk(nextDay, '00:30') // 21:30 UTC on `day`: the UTC date is still `day`
    const query = { fromCity: `${tag}-From`, toCity: `${tag}-To` }

    const dayOne = await call(schedCtl.searchSchedules, { query: { ...query, date: day } })
    const ids1 = dayOne.body.data.schedules.map((s: any) => s.id)
    expect(ids1).toContain(late.id)
    expect(ids1).not.toContain(early.id)

    const dayTwo = await call(schedCtl.searchSchedules, { query: { ...query, date: nextDay } })
    const ids2 = dayTwo.body.data.schedules.map((s: any) => s.id)
    expect(ids2).toContain(early.id)
    expect(ids2).not.toContain(late.id)
  })

  it('returns one trip with its status and seats left, even when closed', async () => {
    const trip = await prisma.schedule.findFirstOrThrow({ where: { busId: bus1.id, departureTime: { gt: new Date() } } })
    await prisma.schedule.update({ where: { id: trip.id }, data: { status: 'CLOSED' } })
    const out = await call(schedCtl.getScheduleById, { params: { id: trip.id } })
    expect(out.status).toBe(200)
    expect(out.body.data.schedule.status).toBe('CLOSED')
    expect(out.body.data.schedule.availableSeats).toBe(10)
    expect(out.body.data.schedule.bus.operator.id).toBe(operatorA.id)
    await prisma.schedule.update({ where: { id: trip.id }, data: { status: 'OPEN' } })

    const missing = await call(schedCtl.getScheduleById, { params: { id: 'nope' } })
    expect(missing.status).toBe(404)
  })

  it('rejects a bad search date', async () => {
    const out = await call(schedCtl.searchSchedules, { query: { date: '2026-13-45' } })
    expect(out.status).toBe(400)
  })

  it('pauses a recurring schedule: removes unbooked future trips, keeps booked ones, then resumes', async () => {
    const t = await makeTemplate(busOfB.id, '14:00')
    await lib.generateForTemplate(t)
    const trips = await tripsOf(t.id)
    expect(trips.length).toBeGreaterThan(5)

    // Book one trip
    const booked = trips[3]
    const b = await call(bookCtl.createBooking, { userId: customer.id, body: { scheduleId: booked.id, seatNumbers: ['02'] } })
    expect(b.status).toBe(201)

    const paused = await call(tplCtl.setTemplateActive, {
      userId: userB.id, userRole: 'OPERATOR', operatorId: operatorB.id, staffRole: 'MANAGER', params: { id: t.id }, body: { active: false },
    })
    expect(paused.status).toBe(200)
    expect(paused.body.data.removed).toBe(trips.length - 1)
    expect((await tripsOf(t.id)).map((x) => x.id)).toEqual([booked.id])

    // Nothing is generated while paused
    await lib.generateForTemplate(await prisma.scheduleTemplate.findUniqueOrThrow({ where: { id: t.id } }))
    expect(await tripsOf(t.id)).toHaveLength(1)

    const resumed = await call(tplCtl.setTemplateActive, {
      userId: userB.id, userRole: 'OPERATOR', operatorId: operatorB.id, staffRole: 'MANAGER', params: { id: t.id }, body: { active: true },
    })
    expect(resumed.status).toBe(200)
    const after = await tripsOf(t.id)
    expect(after).toHaveLength(trips.length)
    expect(after.filter((x) => x.id === booked.id)).toHaveLength(1)
  })

  it("stops an operator from pausing another operator's schedule", async () => {
    const t = await prisma.scheduleTemplate.findFirstOrThrow({ where: { busId: bus1.id } })
    const out = await call(tplCtl.setTemplateActive, {
      userId: userB.id, userRole: 'OPERATOR', operatorId: operatorB.id, staffRole: 'MANAGER', params: { id: t.id }, body: { active: false },
    })
    expect(out.status).toBe(403)
  })

  it('edits a recurring schedule: new price on unbooked trips, booked trips untouched', async () => {
    const t = await prisma.scheduleTemplate.findFirstOrThrow({ where: { busId: busOfB.id } })
    const before = await tripsOf(t.id)
    const bookedId = (await prisma.booking.findFirstOrThrow({ where: { userId: customer.id, scheduleId: { in: before.map((x) => x.id) } } })).scheduleId

    const out = await call(tplCtl.updateTemplate, {
      userId: userB.id, userRole: 'OPERATOR', operatorId: operatorB.id, staffRole: 'MANAGER', params: { id: t.id },
      body: { routeId: route.id, busId: busOfB.id, departureTime: '14:00', price: 450, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
    })
    expect(out.status).toBe(200)
    const after = await tripsOf(t.id)
    expect(after).toHaveLength(before.length)
    for (const trip of after) expect(trip.price).toBe(trip.id === bookedId ? 300 : 450)
  })

  it('refuses a recurring schedule that clashes with the bus on every day', async () => {
    // bus1 already runs 05:00 every day for 6 hours, so 07:00 clashes every day
    const out = await call(tplCtl.createTemplate, {
      userId: userA.id, userRole: 'OPERATOR', operatorId: operatorA.id, staffRole: 'MANAGER',
      body: { routeId: route.id, busId: bus1.id, departureTime: '07:00', price: 300, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
    })
    expect(out.status).toBe(409)
    expect(await prisma.scheduleTemplate.count({ where: { busId: bus1.id } })).toBe(1)
  })

  it("will not let an operator schedule another operator's bus", async () => {
    const out = await call(tplCtl.createTemplate, {
      userId: userA.id, userRole: 'OPERATOR', operatorId: operatorA.id, staffRole: 'MANAGER',
      body: { routeId: route.id, busId: busOfB.id, departureTime: '20:00', price: 300, daysOfWeek: [1] },
    })
    expect(out.status).toBe(403)
  })
})
