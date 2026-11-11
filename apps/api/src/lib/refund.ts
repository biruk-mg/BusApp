import { toBirr, toCents } from './money'

/**
 * The refund rules shown on the Refund Policy page:
 *   24 hours or more before departure -> 100% back
 *   6 to 24 hours before departure    -> 50% back
 *   less than 6 hours before          -> nothing back
 * A trip or booking cancelled by the bus company or the admin always refunds 100%.
 */
export const FULL_REFUND_HOURS = 24
export const HALF_REFUND_HOURS = 6

export function refundPercentFor(hoursLeft: number): 100 | 50 | 0 {
  if (hoursLeft >= FULL_REFUND_HOURS) return 100
  if (hoursLeft >= HALF_REFUND_HOURS) return 50
  return 0
}

export interface RefundResult {
  percent: 100 | 50 | 0
  refundAmount: number
  keepAmount: number
  hoursLeft: number
}

/** What a paid ticket gets back if it is cancelled at `now`. Works in whole cents. */
export function refundFor(totalPrice: number, departureTime: Date, now: Date, byCompany = false): RefundResult {
  const hoursLeft = (departureTime.getTime() - now.getTime()) / 3_600_000
  const percent = byCompany ? 100 : refundPercentFor(hoursLeft)
  const totalCents = toCents(totalPrice)
  const refundCents = Math.round((totalCents * percent) / 100)
  return { percent, refundAmount: toBirr(refundCents), keepAmount: toBirr(totalCents - refundCents), hoursLeft }
}
