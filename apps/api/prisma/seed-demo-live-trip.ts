/**
 * DEMO TRIP for trying live tracking (Start trip / End trip) with a real phone.
 *
 * Adds ONE trip Addis Ababa -> Hossana that leaves about 3 hours from now (a trip can be
 * started from 3 hours before it leaves, so Start trip works at once), on a bus of the company
 * the checker works for, with sample passengers: some already ticked as boarded, some not.
 *
 *   - 7 counter tickets (cash), some with several passengers, spread over the pickup points
 *   - 2 online tickets for demo customer accounts, so the passenger side can follow the bus:
 *       Abebe Kebede  phone 0990000011  (2 seats, both boarded)
 *       Demo Passenger phone 0990000001 (1 seat, not boarded)
 *     both with password password123
 *
 * Everything it creates can be taken away again with --remove (it only touches tickets whose
 * code starts with TEST and whose phone is a 099000... demo number, and the two demo customer accounts).
 *
 * Run from apps/api:
 *   DATABASE_URL="<direct url>" pnpm exec tsx prisma/seed-demo-live-trip.ts
 *   DATABASE_URL="<direct url>" pnpm exec tsx prisma/seed-demo-live-trip.ts --remove
 *
 * Optional settings:
 *   CHECKER_PHONE   the phone number of the checker (or manager) who will test. Default 0911000001
 *   DEPARTS_IN_MIN  minutes until departure. Default 180 (3 hours); more than 180 cannot be started yet
 */
import QRCode from 'qrcode'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'
import { generateTicketCode } from '../src/lib/ticketCode'
import { normalizePhone, phoneVariants } from '../src/lib/phone'

const CODE_PREFIX = 'TEST'
const DEMO_PHONE_PREFIX = '099000'
const DEMO_CUSTOMERS = [
  { name: 'Abebe Kebede', phone: '0990000011' },
  { name: 'Demo Passenger', phone: '0990000001' },
]
const DEMO_CUSTOMER_PHONES = DEMO_CUSTOMERS.map((c) => c.phone)
const DEMO_PASSWORD = 'password123'
const PRICE = 330

const MIN = 60_000
const addisTime = (d: Date) =>
  d.toLocaleString('en-GB', { timeZone: 'Africa/Addis_Ababa', dateStyle: 'medium', timeStyle: 'short' })

const testCode = () => CODE_PREFIX + generateTicketCode().slice(0, 4)

interface Person { seat: string; name: string; boarded: boolean }
interface Ticket { buyer: string; phone: string; pickup: string; people: Person[] }

const COUNTER_TICKETS: Ticket[] = [
  { buyer: 'Selamawit Tadesse', phone: '0990000012', pickup: 'Lamberet (main station)', people: [
    { seat: '03', name: 'Selamawit Tadesse', boarded: true } ] },
  { buyer: 'Dawit Mekonnen', phone: '0990000013', pickup: 'Megenagna', people: [
    { seat: '04', name: 'Dawit Mekonnen', boarded: true }, { seat: '05', name: 'Hana Dawit', boarded: true },
    { seat: '06', name: 'Yonas Dawit', boarded: false } ] },
  { buyer: 'Meron Alemu', phone: '0990000014', pickup: 'Megenagna', people: [
    { seat: '07', name: 'Meron Alemu', boarded: false } ] },
  { buyer: 'Bereket Girma', phone: '0990000015', pickup: 'Mexico', people: [
    { seat: '10', name: 'Bereket Girma', boarded: true } ] },
  { buyer: 'Rahel Haile', phone: '0990000016', pickup: 'Mexico', people: [
    { seat: '11', name: 'Rahel Haile', boarded: false } ] },
  { buyer: 'Samuel Tesfaye', phone: '0990000017', pickup: 'Lideta', people: [
    { seat: '14', name: 'Samuel Tesfaye', boarded: false }, { seat: '15', name: 'Liya Samuel', boarded: false } ] },
  { buyer: 'Kidist Wolde', phone: '0990000018', pickup: 'Garment', people: [
    { seat: '20', name: 'Kidist Wolde', boarded: false } ] },
]

async function remove() {
  const bookings = await prisma.booking.findMany({
    where: {
      ticketCode: { startsWith: CODE_PREFIX },
      OR: [{ passengerPhone: { startsWith: DEMO_PHONE_PREFIX } }, { user: { phone: { in: DEMO_CUSTOMER_PHONES } } }],
    },
    select: { id: true, scheduleId: true },
  })
  const bookingIds = bookings.map((b) => b.id)
  const scheduleIds = [...new Set(bookings.map((b) => b.scheduleId))]

  await prisma.$transaction(async (tx) => {
    await tx.payment.deleteMany({ where: { bookingId: { in: bookingIds } } })
    await tx.booking.deleteMany({ where: { id: { in: bookingIds } } }) // passengers and ratings go with them
    // A trip is removed only when nothing else is booked on it (its live position goes with it)
    const trips = await tx.schedule.deleteMany({ where: { id: { in: scheduleIds }, bookings: { none: {} } } })
    const users = await tx.user.deleteMany({ where: { phone: { in: DEMO_CUSTOMER_PHONES }, bookings: { none: {} } } })
    console.log(`Removed ${bookingIds.length} demo ticket(s), ${trips.count} demo trip(s), ${users.count} demo customer account(s).`)
  })
}

async function add() {
  const checkerPhone = normalizePhone(process.env.CHECKER_PHONE ?? '0911000001')
  if (!checkerPhone) throw new Error('CHECKER_PHONE is not a valid Ethiopian mobile number')

  const user = await prisma.user.findFirst({
    where: { phone: { in: phoneVariants(checkerPhone) } },
    include: { staff: { include: { operator: true } } },
  })
  const staff = user?.staff
  if (!user || !staff || !staff.active || !['CHECKER', 'MANAGER'].includes(staff.role)) {
    throw new Error(`${checkerPhone} is not an active checker or manager of a company. Set CHECKER_PHONE to the number you log in with.`)
  }
  const operator = staff.operator

  const minutes = Number(process.env.DEPARTS_IN_MIN ?? 180)
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error('DEPARTS_IN_MIN must be a number of minutes')
  // Rounded DOWN to 5 minutes, so the trip is never more than 3 hours away and can be started at once
  const departureTime = new Date(Math.floor((Date.now() + minutes * MIN) / (5 * MIN)) * 5 * MIN)

  // The route and its pickup points (the same names as seed-demo-pickups.ts; safe if they exist)
  const route = await prisma.route.upsert({
    where: { fromCity_toCity: { fromCity: 'Addis Ababa', toCity: 'Hossana' } },
    update: {},
    create: { fromCity: 'Addis Ababa', toCity: 'Hossana', distanceKm: 230, estimatedDurationMin: 270 },
  })
  const stops = [
    ['Lamberet (main station)', 0, 0], ['Megenagna', 1, 30], ['Mexico', 2, 45], ['Lideta', 3, 60], ['Garment', 4, 75],
  ] as const
  const pickup: Record<string, string> = {}
  for (const [name, sequence, offsetMin] of stops) {
    const p = await prisma.pickupPoint.upsert({
      where: { operatorId_routeId_name: { operatorId: operator.id, routeId: route.id, name } },
      update: {},
      create: { operatorId: operator.id, routeId: route.id, name, kind: 'PICKUP', sequence, offsetMin },
    })
    pickup[name] = p.id
  }

  // A bus of this company with nothing else leaving around the same time (largest first)
  const buses = await prisma.bus.findMany({ where: { operatorId: operator.id }, orderBy: { totalSeats: 'desc' } })
  if (buses.length === 0) throw new Error(`${operator.companyName} has no buses`)
  const near = await prisma.schedule.findMany({
    where: { busId: { in: buses.map((b) => b.id) }, departureTime: { gte: new Date(departureTime.getTime() - 6 * 60 * MIN), lte: new Date(departureTime.getTime() + 6 * 60 * MIN) } },
    select: { busId: true },
  })
  const busy = new Set(near.map((s) => s.busId))
  const bus = buses.find((b) => !busy.has(b.id)) ?? buses[0]
  const lastSeat = 22
  if (bus.totalSeats < lastSeat) throw new Error(`Bus ${bus.plateNumber} has fewer than ${lastSeat} seats`)

  const schedule = await prisma.schedule.create({
    data: {
      routeId: route.id,
      busId: bus.id,
      departureTime,
      arrivalTime: new Date(departureTime.getTime() + route.estimatedDurationMin * MIN),
      price: PRICE,
    },
  })

  const boardedAt = () => new Date(Date.now() - (5 + Math.floor(Math.random() * 35)) * MIN)
  const passengerRows = (people: Person[], pickupId: string, phone: string | null) =>
    people.map((p) => ({
      seatNumber: p.seat,
      name: p.name,
      phone,
      pickupPointId: pickupId,
      ...(p.boarded ? { boardedAt: boardedAt(), boardedByStaffId: staff.id } : {}),
    }))

  for (const t of COUNTER_TICKETS) {
    const ticketCode = testCode()
    const total = PRICE * t.people.length
    await prisma.booking.create({
      data: {
        scheduleId: schedule.id,
        seatNumbers: t.people.map((p) => p.seat),
        totalPrice: total,
        status: 'CONFIRMED',
        source: 'COUNTER',
        passengerName: t.buyer,
        passengerPhone: t.phone,
        ticketCode,
        soldByStaffId: staff.id,
        pickupPointId: pickup[t.pickup],
        qrCode: await QRCode.toDataURL(ticketCode),
        passengers: { create: passengerRows(t.people, pickup[t.pickup], t.phone) },
        payment: { create: { amount: total, method: 'CASH', status: 'SUCCESS' } },
      },
    })
  }

  // Online tickets for two demo customer accounts (so the passenger side can follow the bus)
  const onlineTickets: { customer: (typeof DEMO_CUSTOMERS)[number]; pickup: string; people: Person[] }[] = [
    { customer: DEMO_CUSTOMERS[0], pickup: 'Lamberet (main station)', people: [
      { seat: '01', name: 'Abebe Kebede', boarded: true }, { seat: '02', name: 'Tigist Abebe', boarded: true } ] },
    { customer: DEMO_CUSTOMERS[1], pickup: 'Lamberet (main station)', people: [
      { seat: '22', name: 'Demo Passenger', boarded: false } ] },
  ]
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)
  for (const t of onlineTickets) {
    const customer = await prisma.user.upsert({
      where: { phone: t.customer.phone },
      update: {},
      create: { name: t.customer.name, phone: t.customer.phone, password: passwordHash, role: 'CUSTOMER' },
    })
    const onlineCode = testCode()
    const total = PRICE * t.people.length
    await prisma.booking.create({
      data: {
        userId: customer.id,
        scheduleId: schedule.id,
        seatNumbers: t.people.map((p) => p.seat),
        totalPrice: total,
        status: 'CONFIRMED',
        source: 'ONLINE',
        ticketCode: onlineCode,
        pickupPointId: pickup[t.pickup],
        qrCode: await QRCode.toDataURL(onlineCode),
        commissionPercent: operator.commissionPercent,
        passengers: { create: passengerRows(t.people, pickup[t.pickup], t.customer.phone) },
        payment: { create: { amount: total, method: 'TELEBIRR', chapaRef: `TEST-${onlineCode}`, status: 'SUCCESS' } },
      },
    })
  }

  const all = [...COUNTER_TICKETS.flatMap((t) => t.people), ...onlineTickets.flatMap((t) => t.people)]
  const boarded = all.filter((p) => p.boarded).length
  console.log(`
Demo trip ready for ${operator.companyName}
  Trip:        Addis Ababa -> Hossana, bus ${bus.plateNumber}
  Leaves:      ${addisTime(departureTime)} (Addis time)${minutes > 180 ? '   NOTE: more than 3 hours away, Start trip opens later' : ''}
  Trip id:     ${schedule.id}
  Passengers:  ${all.length} seats sold, ${boarded} already ticked as boarded
  Log in as:   ${checkerPhone} (checker screen: /checker, pick the date of the departure)
  Passenger logins (password ${DEMO_PASSWORD}, open My bookings, then the ticket):
    Abebe Kebede   ${DEMO_CUSTOMERS[0].phone}  seats 01, 02
    Demo Passenger ${DEMO_CUSTOMERS[1].phone}  seat 22

Remove it all later with:  pnpm exec tsx prisma/seed-demo-live-trip.ts --remove`)
}

async function main() {
  if (process.argv.includes('--remove')) await remove()
  else await add()
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e)
  await prisma.$disconnect()
  process.exit(1)
})
