import { Prisma } from '@prisma/client'

/** How long unpaid seats stay reserved after booking. */
export const HOLD_MINUTES = 15
/** The hold is extended to this when the passenger starts paying. */
export const PAYMENT_WINDOW_MINUTES = 20

const minutes = (n: number) => n * 60 * 1000

/** Seat labels used by the seat map on the website: "01", "02", ... */
export function seatLabels(totalSeats: number): string[] {
  return Array.from({ length: totalSeats }, (_, i) => String(i + 1).padStart(2, '0'))
}

/**
 * Bookings that currently hold seats: paid ones (CONFIRMED), plus unpaid ones
 * (PENDING) whose hold has not run out yet. Older PENDING rows without an
 * expiry fall back to createdAt + HOLD_MINUTES.
 */
export function activeBookingFilter(now = new Date()): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: 'CONFIRMED' },
      {
        status: 'PENDING',
        OR: [
          { expiresAt: { gt: now } },
          { expiresAt: null, createdAt: { gt: new Date(now.getTime() - minutes(HOLD_MINUTES)) } },
        ],
      },
    ],
  }
}

/** Cancels unpaid bookings whose hold has run out, which frees their seats. */
export async function releaseExpiredHolds(
  client: Prisma.TransactionClient,
  extraWhere: Prisma.BookingWhereInput = {},
  now = new Date()
): Promise<number> {
  const result = await client.booking.updateMany({
    where: {
      ...extraWhere,
      status: 'PENDING',
      OR: [
        { expiresAt: { lt: now } },
        { expiresAt: null, createdAt: { lt: new Date(now.getTime() - minutes(HOLD_MINUTES)) } },
      ],
    },
    data: { status: 'CANCELLED' },
  })
  return result.count
}
