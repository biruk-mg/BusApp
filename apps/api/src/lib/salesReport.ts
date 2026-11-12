import { Prisma } from '@prisma/client'
import { RETAINED_BOOKING } from './earnings'
import { commissionCents, toBirr, toCents } from './money'
import { addDaysToDateString, addisDateString, addisDayRange, addisToUtc } from './time'

/**
 * What counts as a sale on the admin screens: a confirmed (or completed) booking, and
 * the part a company KEPT from a paid online ticket that was cancelled with a partial
 * refund (Refund Policy). Voided counter sales and fully refunded tickets are not sales.
 */
export const SALE_BOOKING: Prisma.BookingWhereInput = {
  OR: [{ status: { in: ['CONFIRMED', 'COMPLETED'] } }, RETAINED_BOOKING],
}

export interface SaleRow {
  status: string
  totalPrice: number
  refundAmount: number | null
}

/** The money this booking brought in, in cents: the price, or only the part kept after a refund. */
export const soldCents = (r: SaleRow): number =>
  r.status === 'CANCELLED' ? toCents(r.totalPrice) - toCents(r.refundAmount ?? r.totalPrice) : toCents(r.totalPrice)

/** A kept cancellation adds money but is not a ticket that travels. */
export const isTicket = (r: SaleRow): boolean => r.status !== 'CANCELLED'

export const PERIODS = ['today', '7d', '30d', 'month'] as const
export type Period = (typeof PERIODS)[number]
export const isPeriod = (v: unknown): v is Period => typeof v === 'string' && (PERIODS as readonly string[]).includes(v)

/** The period as Addis calendar days: from the start of the first day up to the end of today. */
export function periodRange(period: Period, now: Date = new Date()): { from: Date; to: Date; days: string[] } {
  const today = addisDateString(now)
  const first =
    period === 'today' ? today
    : period === '7d' ? addDaysToDateString(today, -6)
    : period === '30d' ? addDaysToDateString(today, -29)
    : today.slice(0, 8) + '01'
  const days: string[] = []
  for (let d = first; d <= today; d = addDaysToDateString(d, 1)) days.push(d)
  return { from: addisToUtc(first, '00:00'), to: addisDayRange(today).end, days }
}

export interface Money { tickets: number; total: number }
export const blankMoney = (): Money => ({ tickets: 0, total: 0 })

/** Adds one booking to a running total, in cents, so the sum is exact. */
export class MoneyCents {
  tickets = 0
  cents = 0
  add(r: SaleRow) {
    if (isTicket(r)) this.tickets += 1
    this.cents += soldCents(r)
  }
  out(): Money {
    return { tickets: this.tickets, total: toBirr(this.cents) }
  }
}

/** The platform's commission on one online sale (rate frozen at payment, else the company's current rate). */
export const saleCommissionCents = (r: SaleRow, frozen: number | null, fallback: number) =>
  commissionCents(soldCents(r), frozen ?? fallback)
