/**
 * Money maths for payouts. Everything is done in whole cents (1 birr = 100 cents)
 * so floating point can never create or lose a cent. Prices are stored as
 * birr with decimals; these helpers convert at the edges only.
 */

export const toCents = (birr: number): number => Math.round(birr * 100)
export const toBirr = (cents: number): number => cents / 100

/** True for a positive amount with at most two decimals (a real birr + cents value). */
export function isValidBirrAmount(amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false
  return Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6
}

/**
 * The platform's share of one booking, in cents, rounded to the nearest cent
 * (half up). Rounded per booking, so the statement lines add up exactly.
 */
export function commissionCents(grossCents: number, percent: number): number {
  return Math.round((grossCents * percent) / 100 + 1e-9)
}

/** One paid online booking, as the earnings maths needs it. */
export interface EarningInput {
  totalPrice: number
  /** The rate frozen when the payment was confirmed; null for older bookings. */
  commissionPercent: number | null
  departureTime: Date
}

export interface EarningLine {
  grossCents: number
  commissionCents: number
  netCents: number
  departed: boolean
}

export function earningLine(row: EarningInput, fallbackPercent: number, now: Date): EarningLine {
  const grossCents = toCents(row.totalPrice)
  const commission = commissionCents(grossCents, row.commissionPercent ?? fallbackPercent)
  return {
    grossCents,
    commissionCents: commission,
    netCents: grossCents - commission,
    departed: row.departureTime.getTime() <= now.getTime(),
  }
}

export interface EarningsSummary {
  tickets: number
  grossCents: number
  commissionCents: number
  /** What the company earned in total (gross minus the platform's share). */
  netCents: number
  /** The part of it from trips that have already departed: this is what can be paid out. */
  availableCents: number
  /** The part from trips that have not departed yet (a trip can still be closed or refunded). */
  pendingCents: number
  /** Payouts already made (voided ones excluded). */
  paidCents: number
  /** available - paid. Negative means the company has been paid more than it has earned. */
  balanceCents: number
}

export function summarizeEarnings(
  rows: EarningInput[],
  fallbackPercent: number,
  paidCents: number,
  now: Date
): EarningsSummary {
  let gross = 0, commission = 0, available = 0, pending = 0
  for (const row of rows) {
    const line = earningLine(row, fallbackPercent, now)
    gross += line.grossCents
    commission += line.commissionCents
    if (line.departed) available += line.netCents
    else pending += line.netCents
  }
  return {
    tickets: rows.length,
    grossCents: gross,
    commissionCents: commission,
    netCents: gross - commission,
    availableCents: available,
    pendingCents: pending,
    paidCents,
    balanceCents: available - paidCents,
  }
}

/** The same summary in birr, ready to send to the web app. "due" is what can be paid now. */
export function shapeSummary(s: EarningsSummary) {
  return {
    tickets: s.tickets,
    gross: toBirr(s.grossCents),
    commission: toBirr(s.commissionCents),
    net: toBirr(s.netCents),
    available: toBirr(s.availableCents),
    pending: toBirr(s.pendingCents),
    paid: toBirr(s.paidCents),
    due: toBirr(Math.max(s.balanceCents, 0)),
    overpaid: toBirr(Math.max(-s.balanceCents, 0)),
  }
}
