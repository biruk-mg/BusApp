import { Prisma, PrismaClient } from '@prisma/client'
import { prisma as defaultPrisma } from './prisma'
import { EARNING_BOOKING, RETAINED_BOOKING } from './earnings'
import { commissionCents, toBirr, toCents } from './money'
import { addDaysToDateString, addisDateString, addisDayRange, addisToUtc, addisTimeString } from './time'
import { birr, toCsv, type CsvValue } from './csv'

type Client = PrismaClient | Prisma.TransactionClient

/**
 * The monthly statement of one company: what its ONLINE tickets earned, the platform's commission,
 * what has been paid out, and what is still owed. It is built from the same rules as the Earnings
 * page (earnings.ts), so the two can never disagree.
 *
 * One rule for every line: a ticket belongs to the month its TRIP DEPARTED (Addis Ababa time), not
 * the day it was sold. That is when the company has earned the money, and it is the same moment
 * the Earnings page makes money "available" to pay out. For the current month only the trips that
 * have already left are counted; the rest are shown as "still to depart".
 *
 * Counter sales are cash the company already holds. They are listed for information and are not
 * part of the balance.
 *
 * The statement is calculated when it is opened. It is not locked: if a payout is voided later,
 * an old month changes. The time it was generated is always printed on it.
 */

export const isMonthString = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)

export const currentMonth = (now: Date = new Date()): string => addisDateString(now).slice(0, 7)

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const monthLabel = (month: string): string => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`

/** The month as Addis calendar days, as UTC moments: start included, end excluded. */
export function monthRange(month: string): { start: Date; end: Date; firstDay: string; lastDay: string } {
  const year = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const nextFirst = m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, '0')}-01`
  return { start: addisToUtc(`${month}-01`), end: addisToUtc(nextFirst), firstDay: `${month}-01`, lastDay: addDaysToDateString(nextFirst, -1) }
}

const earningSelect = {
  scheduleId: true,
  status: true,
  totalPrice: true,
  refundAmount: true,
  commissionPercent: true,
  seatNumbers: true,
  schedule: { select: { departureTime: true, route: { select: { fromCity: true, toCity: true } } } },
} satisfies Prisma.BookingSelect

interface Money {
  value: number // ticket value before refunds, in cents
  refund: number // given back to passengers, in cents
  earned: number // value - refund, in cents
  commission: number
}
const blank = (): Money => ({ value: 0, refund: 0, earned: 0, commission: 0 })

export interface StatementTrip {
  scheduleId: string
  departureTime: Date
  route: string
  tickets: number
  seats: number
  ticketValue: number
  refunded: number
  earned: number
  commission: number
  net: number
}

export async function loadStatement(operatorId: string, month: string, client: Client = defaultPrisma, now: Date = new Date()) {
  const operator = await client.operator.findUnique({ where: { id: operatorId }, select: { id: true, companyName: true, commissionPercent: true } })
  if (!operator) return null

  const { start, end, firstDay, lastDay } = monthRange(month)
  // Only trips that have left count, so a month still to come has nothing to show
  const upper = new Date(Math.min(end.getTime(), now.getTime() + 1))

  const [earning, payouts, fullRefunds, counter] = await Promise.all([
    client.booking.findMany({
      where: { AND: [{ OR: [EARNING_BOOKING, RETAINED_BOOKING] }, { schedule: { bus: { operatorId }, departureTime: { lt: end } } }] },
      select: earningSelect,
    }),
    client.payout.findMany({ where: { operatorId, paidAt: { lt: end } }, orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }] }),
    client.booking.findMany({
      where: { source: 'ONLINE', status: 'CANCELLED', refundPercent: 100, schedule: { bus: { operatorId }, departureTime: { gte: start, lt: upper } } },
      select: { totalPrice: true, refundAmount: true },
    }),
    client.booking.findMany({
      where: { source: 'COUNTER', schedule: { bus: { operatorId }, departureTime: { gte: start, lt: upper } } },
      select: { status: true, totalPrice: true, seatNumbers: true, payment: { select: { method: true } } },
    }),
  ])

  // ─── Online money ──────────────────────────────────────────────────────────
  let openingNet = 0 // earned and departed before this month
  const month$ = blank()
  const pending = blank()
  let tickets = 0
  let seats = 0
  const trips = new Map<string, { departureTime: Date; route: string; tickets: number; seats: number; money: Money }>()

  for (const b of earning) {
    const value = toCents(b.totalPrice)
    const refund = b.status === 'CANCELLED' ? toCents(b.refundAmount ?? b.totalPrice) : 0
    const earned = value - refund
    const commission = commissionCents(earned, b.commissionPercent ?? operator.commissionPercent)
    const departure = b.schedule.departureTime

    if (departure < start) {
      openingNet += earned - commission
      continue
    }
    if (departure > now) {
      pending.earned += earned
      pending.commission += commission
      continue
    }
    month$.value += value
    month$.refund += refund
    month$.earned += earned
    month$.commission += commission
    const travels = b.status !== 'CANCELLED' // a cancelled ticket adds kept money, not a seat that travels
    if (travels) {
      tickets += 1
      seats += b.seatNumbers.length
    }
    const row = trips.get(b.scheduleId) ?? { departureTime: departure, route: `${b.schedule.route.fromCity} - ${b.schedule.route.toCity}`, tickets: 0, seats: 0, money: blank() }
    if (travels) {
      row.tickets += 1
      row.seats += b.seatNumbers.length
    }
    row.money.value += value
    row.money.refund += refund
    row.money.earned += earned
    row.money.commission += commission
    trips.set(b.scheduleId, row)
  }

  // ─── Payouts ───────────────────────────────────────────────────────────────
  const live = payouts.filter((p) => !p.voidedAt)
  const paidBefore = live.filter((p) => p.paidAt < start).reduce((n, p) => n + toCents(p.amount), 0)
  const inMonth = live.filter((p) => p.paidAt >= start)
  const paidInMonth = inMonth.reduce((n, p) => n + toCents(p.amount), 0)
  const voidedInMonth = payouts.filter((p) => p.voidedAt && p.paidAt >= start)

  const openingBalance = openingNet - paidBefore
  const monthNet = month$.earned - month$.commission
  const closingBalance = openingBalance + monthNet - paidInMonth

  // ─── Counter (information only) ────────────────────────────────────────────
  const byMethod = new Map<string, { tickets: number; seats: number; cents: number }>()
  const counterTotal = { tickets: 0, seats: 0, cents: 0 }
  const voided = { tickets: 0, cents: 0 }
  for (const c of counter) {
    if (c.status === 'CANCELLED') {
      voided.tickets += 1
      voided.cents += toCents(c.totalPrice)
      continue
    }
    if (c.status !== 'CONFIRMED' && c.status !== 'COMPLETED') continue
    const method = c.payment?.method ?? 'UNKNOWN'
    const row = byMethod.get(method) ?? { tickets: 0, seats: 0, cents: 0 }
    for (const t of [row, counterTotal]) {
      t.tickets += 1
      t.seats += c.seatNumbers.length
      t.cents += toCents(c.totalPrice)
    }
    byMethod.set(method, row)
  }

  return {
    company: { id: operator.id, companyName: operator.companyName },
    month,
    label: monthLabel(month),
    firstDay,
    lastDay,
    generatedAt: now.toISOString(),
    inProgress: now < end,
    basis: 'Online tickets of trips that departed in this month (Addis Ababa time)',
    openingBalance: toBirr(openingBalance),
    online: {
      tickets,
      seats,
      ticketValue: toBirr(month$.value),
      refunded: toBirr(month$.refund),
      earned: toBirr(month$.earned),
      commission: toBirr(month$.commission),
      net: toBirr(monthNet),
    },
    payouts: {
      total: toBirr(paidInMonth),
      items: inMonth.map((p) => ({ id: p.id, paidAt: p.paidAt.toISOString(), method: p.method, reference: p.reference, note: p.note, amount: p.amount })),
      voided: voidedInMonth.map((p) => ({ id: p.id, paidAt: p.paidAt.toISOString(), method: p.method, reference: p.voidedReference, amount: p.amount, reason: p.voidReason })),
    },
    closingBalance: toBirr(closingBalance),
    stillToDepart: { net: toBirr(pending.earned - pending.commission) },
    fullRefunds: { tickets: fullRefunds.length, amount: toBirr(fullRefunds.reduce((n, b) => n + toCents(b.refundAmount ?? b.totalPrice), 0)) },
    counter: {
      tickets: counterTotal.tickets,
      seats: counterTotal.seats,
      total: toBirr(counterTotal.cents),
      byMethod: [...byMethod.entries()].map(([method, r]) => ({ method, tickets: r.tickets, seats: r.seats, total: toBirr(r.cents) })).sort((a, b) => a.method.localeCompare(b.method)),
      voided: { tickets: voided.tickets, total: toBirr(voided.cents) },
    },
    trips: [...trips.entries()]
      .map(([scheduleId, t]): StatementTrip => ({
        scheduleId,
        departureTime: t.departureTime,
        route: t.route,
        tickets: t.tickets,
        seats: t.seats,
        ticketValue: toBirr(t.money.value),
        refunded: toBirr(t.money.refund),
        earned: toBirr(t.money.earned),
        commission: toBirr(t.money.commission),
        net: toBirr(t.money.earned - t.money.commission),
      }))
      .sort((a, b) => a.departureTime.getTime() - b.departureTime.getTime()),
  }
}

export type Statement = NonNullable<Awaited<ReturnType<typeof loadStatement>>>

const dateOf = (d: Date | string) => addisDateString(new Date(d))
const timeOf = (d: Date | string) => addisTimeString(new Date(d))

/** The statement as one CSV file (sections one under the other), for Excel. */
export function statementCsv(s: Statement): string {
  const rows: CsvValue[][] = [
    ['MugoBus operator statement'],
    ['Company', s.company.companyName],
    ['Month', s.label],
    ['Basis', s.basis],
    ['Status', s.inProgress ? 'Month still in progress: only trips that have already left are counted' : 'Complete'],
    ['Generated (Addis time)', `${dateOf(s.generatedAt)} ${timeOf(s.generatedAt)}`],
    ['Note', 'Calculated when it was opened and not locked. A payout voided later changes an old month.'],
    [],
    ['Summary (ETB)'],
    ['Opening balance (owed to the company at the start of the month)', birr(s.openingBalance)],
    ['Online ticket value', birr(s.online.ticketValue)],
    ['Refunded to passengers', birr(-s.online.refunded)],
    ['Earned by the company before commission', birr(s.online.earned)],
    ['Platform commission', birr(-s.online.commission)],
    ['Net earned this month', birr(s.online.net)],
    ['Payouts made this month', birr(-s.payouts.total)],
    ['Closing balance (positive: owed to the company, negative: paid more than earned)', birr(s.closingBalance)],
    ['Still to depart this month (net, not yet counted)', birr(s.stillToDepart.net)],
    ['Tickets / seats that travelled', `${s.online.tickets} / ${s.online.seats}`],
    ['Tickets fully refunded (no money kept): number', s.fullRefunds.tickets],
    ['Tickets fully refunded (no money kept): amount', birr(s.fullRefunds.amount)],
    [],
    ['Trips'],
    ['Date', 'Departure', 'Route', 'Tickets', 'Seats', 'Ticket value', 'Refunded', 'Earned', 'Commission', 'Net'],
    ...s.trips.map((t) => [dateOf(t.departureTime), timeOf(t.departureTime), t.route, t.tickets, t.seats, birr(t.ticketValue), birr(t.refunded), birr(t.earned), birr(t.commission), birr(t.net)]),
    [],
    ['Payouts'],
    ['Date', 'Method', 'Receipt / transaction number', 'Note', 'Amount'],
    ...s.payouts.items.map((p) => [dateOf(p.paidAt), p.method, p.reference, p.note, birr(p.amount)]),
    ...(s.payouts.voided.length ? [[], ['Voided payouts (not counted)'], ...s.payouts.voided.map((p) => [dateOf(p.paidAt), p.method, p.reference, p.reason, birr(p.amount)])] : []),
    [],
    ['Counter sales (cash taken at the counter: information only, not part of the balance)'],
    ['Payment method', 'Tickets', 'Seats', 'Total'],
    ...s.counter.byMethod.map((m) => [m.method, m.tickets, m.seats, birr(m.total)]),
    ['All counter sales', s.counter.tickets, s.counter.seats, birr(s.counter.total)],
    ['Voided counter tickets (not counted)', s.counter.voided.tickets, '', birr(s.counter.voided.total)],
  ]
  return toCsv(rows)
}

// ─── Sales export: every ticket sold in a range of days ──────────────────────

export const MAX_EXPORT_DAYS = 366
export const MAX_EXPORT_ROWS = 50_000

/** Every ticket SOLD between two Addis dates (first and last day included), one line each. */
export async function loadSalesExport(operatorId: string, from: string, to: string, client: Client = defaultPrisma) {
  const operator = await client.operator.findUnique({ where: { id: operatorId }, select: { companyName: true, commissionPercent: true } })
  if (!operator) return null
  const bookings = await client.booking.findMany({
    where: {
      schedule: { bus: { operatorId } },
      createdAt: { gte: addisDayRange(from).start, lt: addisDayRange(to).end },
      // Sold tickets, and cancelled ones that involved money (refunds, voided counter tickets). Unpaid holds are not sales.
      OR: [{ status: { in: ['CONFIRMED', 'COMPLETED'] } }, { status: 'CANCELLED', OR: [{ source: 'COUNTER' }, { refundPercent: { not: null } }] }],
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_EXPORT_ROWS + 1,
    select: {
      createdAt: true, ticketCode: true, source: true, status: true, seatNumbers: true, totalPrice: true,
      refundAmount: true, commissionPercent: true,
      pickupPoint: { select: { name: true } },
      payment: { select: { method: true } },
      soldByStaff: { select: { user: { select: { name: true } } } },
      schedule: { select: { departureTime: true, route: { select: { fromCity: true, toCity: true } } } },
    },
  })
  if (bookings.length > MAX_EXPORT_ROWS) return { operator, tooMany: true as const }

  const lines = bookings.map((b) => {
    const value = toCents(b.totalPrice)
    const online = b.source === 'ONLINE'
    const cancelled = b.status === 'CANCELLED'
    // Online: what the company kept is the price, or the part kept after a refund. Counter: the money is already in the till.
    const refunded = online && cancelled ? toCents(b.refundAmount ?? b.totalPrice) : 0
    const kept = cancelled && !online ? 0 : value - refunded
    const commission = online ? commissionCents(kept, b.commissionPercent ?? operator.commissionPercent) : 0
    return [
      dateOf(b.createdAt), timeOf(b.createdAt), b.ticketCode, b.source === 'COUNTER' ? 'Counter' : 'Online',
      cancelled ? (online ? 'Cancelled' : 'Voided') : 'Sold',
      dateOf(b.schedule.departureTime), timeOf(b.schedule.departureTime),
      `${b.schedule.route.fromCity} - ${b.schedule.route.toCity}`,
      b.seatNumbers.length, b.pickupPoint?.name ?? '',
      birr(toBirr(value)), birr(toBirr(refunded)), birr(toBirr(kept)),
      online ? `${b.commissionPercent ?? operator.commissionPercent}%` : '', birr(toBirr(commission)), birr(toBirr(kept - commission)),
      b.payment?.method ?? '', b.soldByStaff?.user.name ?? '',
    ] as CsvValue[]
  })
  return { operator, tooMany: false as const, lines }
}

export const SALES_EXPORT_HEADER: CsvValue[] = [
  'Sale date', 'Sale time', 'Ticket code', 'Channel', 'Status', 'Trip date', 'Departure', 'Route', 'Seats', 'Pickup point',
  'Ticket value', 'Refunded', 'Kept by company', 'Commission rate', 'Commission', 'Net to company', 'Payment method', 'Sold by',
]

export const salesExportCsv = (lines: CsvValue[][]) => toCsv([SALES_EXPORT_HEADER, ...lines])
