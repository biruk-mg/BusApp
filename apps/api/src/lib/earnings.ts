import { Prisma, PrismaClient } from '@prisma/client'
import { prisma as defaultPrisma } from './prisma'
import { EarningInput, earningLine, summarizeEarnings, shapeSummary, toBirr, toCents } from './money'

type Client = PrismaClient | Prisma.TransactionClient

/**
 * Which bookings earn money for a company: ONLINE bookings that are confirmed (or
 * completed), whose payment succeeded and has not been refunded. Counter sales are
 * not included: the company keeps that money at the counter, so there is nothing
 * to pay out and no commission on it.
 */
export const EARNING_BOOKING: Prisma.BookingWhereInput = {
  source: 'ONLINE',
  status: { in: ['CONFIRMED', 'COMPLETED'] },
  payment: { is: { status: 'SUCCESS', refundedAt: null } },
}

const earningSelect = {
  scheduleId: true,
  totalPrice: true,
  commissionPercent: true,
  seatNumbers: true,
  schedule: {
    select: {
      departureTime: true,
      route: { select: { fromCity: true, toCity: true } },
      bus: { select: { operatorId: true } },
    },
  },
} satisfies Prisma.BookingSelect

type EarningRow = Prisma.BookingGetPayload<{ select: typeof earningSelect }>

const asInput = (b: EarningRow): EarningInput => ({
  totalPrice: b.totalPrice,
  commissionPercent: b.commissionPercent,
  departureTime: b.schedule.departureTime,
})

/** Payouts that count (voided ones do not), summed in cents. */
const paidCentsOf = (payouts: { amount: number; voidedAt: Date | null }[]) =>
  payouts.filter((p) => !p.voidedAt).reduce((n, p) => n + toCents(p.amount), 0)

const MAX_TRIPS = 100

/**
 * Everything about one company's money: the totals, a statement per trip, and the
 * payout history. Used by the admin screen, the company's own earnings page and
 * the check made before a payout is recorded.
 */
export async function loadEarnings(operatorId: string, client: Client = defaultPrisma, now: Date = new Date()) {
  const operator = await client.operator.findUnique({
    where: { id: operatorId },
    select: { id: true, companyName: true, commissionPercent: true, status: true, isDemo: true },
  })
  if (!operator) return null

  const [bookings, payouts] = await Promise.all([
    client.booking.findMany({
      where: { ...EARNING_BOOKING, schedule: { bus: { operatorId } } },
      select: earningSelect,
    }),
    client.payout.findMany({ where: { operatorId }, orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }] }),
  ])

  const summary = summarizeEarnings(bookings.map(asInput), operator.commissionPercent, paidCentsOf(payouts), now)

  // One line per trip, newest first
  const byTrip = new Map<string, { departureTime: Date; fromCity: string; toCity: string; tickets: number; seats: number; gross: number; commission: number }>()
  for (const b of bookings) {
    const line = earningLine(asInput(b), operator.commissionPercent, now)
    const row = byTrip.get(b.scheduleId) ?? {
      departureTime: b.schedule.departureTime,
      fromCity: b.schedule.route.fromCity,
      toCity: b.schedule.route.toCity,
      tickets: 0, seats: 0, gross: 0, commission: 0,
    }
    row.tickets += 1
    row.seats += b.seatNumbers.length
    row.gross += line.grossCents
    row.commission += line.commissionCents
    byTrip.set(b.scheduleId, row)
  }
  const allTrips = [...byTrip.entries()]
    .map(([scheduleId, t]) => ({
      scheduleId,
      departureTime: t.departureTime,
      fromCity: t.fromCity,
      toCity: t.toCity,
      tickets: t.tickets,
      seats: t.seats,
      gross: toBirr(t.gross),
      commission: toBirr(t.commission),
      net: toBirr(t.gross - t.commission),
      departed: t.departureTime.getTime() <= now.getTime(),
    }))
    .sort((a, b) => b.departureTime.getTime() - a.departureTime.getTime())

  return {
    operator,
    summary,
    shaped: shapeSummary(summary),
    trips: allTrips.slice(0, MAX_TRIPS),
    tripsTruncated: allTrips.length > MAX_TRIPS,
    payouts,
  }
}

/** The totals for every company at once (the admin's payout overview). */
export async function loadAllBalances(client: Client = defaultPrisma, now: Date = new Date()) {
  const [operators, bookings, payouts] = await Promise.all([
    client.operator.findMany({
      select: { id: true, companyName: true, status: true, isDemo: true, commissionPercent: true },
      orderBy: { companyName: 'asc' },
    }),
    client.booking.findMany({ where: EARNING_BOOKING, select: earningSelect }),
    client.payout.findMany({ select: { operatorId: true, amount: true, voidedAt: true, paidAt: true } }),
  ])

  return operators.map((o) => {
    const mine = bookings.filter((b) => b.schedule.bus.operatorId === o.id)
    const myPayouts = payouts.filter((p) => p.operatorId === o.id)
    const summary = summarizeEarnings(mine.map(asInput), o.commissionPercent, paidCentsOf(myPayouts), now)
    const last = myPayouts.filter((p) => !p.voidedAt).sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0]
    return {
      id: o.id,
      companyName: o.companyName,
      status: o.status,
      isDemo: o.isDemo,
      commissionPercent: o.commissionPercent,
      lastPayoutAt: last?.paidAt ?? null,
      ...shapeSummary(summary),
      dueCents: Math.max(summary.balanceCents, 0),
    }
  })
}
