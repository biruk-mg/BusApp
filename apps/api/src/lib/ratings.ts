import { prisma } from './prisma'

/**
 * Ratings: a passenger rates a trip once it has left AND the ticket checker has marked
 * them as boarded. The stars belong to the bus company. Rules in one place, so the
 * routes, the booking pages and the tests agree.
 */

/** A company's average is public only from this many ratings, so one angry rating cannot sink a new company. */
export const MIN_PUBLIC_RATINGS = 3
/** A passenger can rate a trip for this long after it left... */
export const RATE_WITHIN_DAYS = 30
/** ...and change their rating for this long after they first gave it. */
export const EDIT_WITHIN_DAYS = 7
export const MAX_COMMENT_LENGTH = 500

const DAY_MS = 24 * 60 * 60 * 1000

export type RatingState = {
  /** The passenger may give a rating right now (none given yet). */
  canRate: boolean
  /** The passenger may still change the rating they gave. */
  canEdit: boolean
}

type RatableBooking = {
  status: string
  userId: string | null
  // Both are needed to know if anyone boarded: the fields are required on purpose, so a
  // query that forgets to load them fails the type check instead of quietly blocking ratings.
  boardedAt: Date | null
  passengers: { boardedAt: Date | null }[]
  schedule: { departureTime: Date }
  rating?: { createdAt: Date } | null
}

/**
 * Has the ticket checker marked someone on this ticket as boarded? Boarding is recorded
 * per passenger; only tickets sold before passenger details existed use the ticket's own
 * boardedAt. If at least one person boarded, the person who booked may rate the trip.
 */
export function hasBoarded(booking: Pick<RatableBooking, 'boardedAt' | 'passengers'>): boolean {
  return booking.boardedAt !== null || booking.passengers.some((p) => p.boardedAt !== null)
}

/**
 * Who may rate: the account that made the booking, for a paid booking whose trip has
 * already left and on which the checker marked someone as boarded, up to 30 days after it
 * left. Cancelled and unpaid bookings never can, and neither can someone who never boarded.
 * A rating already given can still be changed (for 7 days) even if boarding is undone later.
 */
export function ratingState(booking: RatableBooking, now: Date = new Date()): RatingState {
  const paid = booking.status === 'CONFIRMED' || booking.status === 'COMPLETED'
  const left = booking.userId !== null && paid && booking.schedule.departureTime.getTime() <= now.getTime()
  if (!left) return { canRate: false, canEdit: false }
  if (booking.rating) {
    return { canRate: false, canEdit: now.getTime() - booking.rating.createdAt.getTime() <= EDIT_WITHIN_DAYS * DAY_MS }
  }
  if (!hasBoarded(booking)) return { canRate: false, canEdit: false }
  const windowOpen = now.getTime() - booking.schedule.departureTime.getTime() <= RATE_WITHIN_DAYS * DAY_MS
  return { canRate: windowOpen, canEdit: false }
}

export type RatingSummary = { average: number; count: number }

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * The public rating of each company: only companies with enough ratings are included.
 * Hidden comments do not matter here: the stars always count.
 */
export async function publicRatingSummaries(operatorIds: string[]): Promise<Map<string, RatingSummary>> {
  const ids = [...new Set(operatorIds)]
  const result = new Map<string, RatingSummary>()
  if (ids.length === 0) return result
  const groups = await prisma.rating.groupBy({
    by: ['operatorId'],
    where: { operatorId: { in: ids } },
    _avg: { stars: true },
    _count: { _all: true },
  })
  for (const g of groups) {
    if (g._count._all >= MIN_PUBLIC_RATINGS && g._avg.stars !== null) {
      result.set(g.operatorId, { average: round1(g._avg.stars), count: g._count._all })
    }
  }
  return result
}

/** `rating` for a company object that is about to be sent to the public: the summary, or null. */
export function withPublicRating<T extends { id: string }>(
  company: T,
  summaries: Map<string, RatingSummary>
): T & { rating: RatingSummary | null } {
  return { ...company, rating: summaries.get(company.id) ?? null }
}
