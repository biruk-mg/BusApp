import { Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { companyOf } from '../middleware/staff'
import {
  EDIT_WITHIN_DAYS,
  MAX_COMMENT_LENGTH,
  MIN_PUBLIC_RATINGS,
  RATE_WITHIN_DAYS,
  hasBoarded,
  ratingState,
} from '../lib/ratings'

/**
 * Ratings. A passenger rates a trip once it has left and they have boarded (stars 1-5 and an
 * optional comment).
 *  - Passenger: PUT /bookings/:id/rating
 *  - Company managers: GET /operator/ratings (their own stars, per bus, and comments)
 *  - Admin: GET /admin/ratings, POST /admin/ratings/:id/hide | unhide
 * The public sees only a company's average and count (on search results), never a comment.
 */

class RuleError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}
const isUniqueError = (e: unknown) => (e as { code?: string })?.code === 'P2002'

function fail(res: Response, error: unknown, label: string): void {
  if (error instanceof RuleError) {
    res.status(error.status).json({ success: false, error: error.message })
    return
  }
  console.error(`${label} error:`, error)
  res.status(500).json({ success: false, error: 'Internal server error' })
}

const round1 = (n: number) => Math.round(n * 10) / 10
const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'Passenger'

// ─── Passenger: give or change a rating ──────────────────
const ratingSchema = z.object({
  stars: z.number().int('Stars must be a whole number').min(1, 'Choose 1 to 5 stars').max(5, 'Choose 1 to 5 stars'),
  comment: z
    .string()
    .trim()
    .max(MAX_COMMENT_LENGTH, `The comment can be at most ${MAX_COMMENT_LENGTH} letters`)
    .optional()
    .nullable(),
})

export const rateBooking = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = ratingSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid rating' })
      return
    }
    const { stars } = parsed.data
    const comment = parsed.data.comment ? parsed.data.comment : null

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id as string },
      include: { schedule: { include: { bus: true } }, rating: true, passengers: { select: { boardedAt: true } } },
    })
    // Someone else's booking looks exactly like a booking that does not exist
    if (!booking || booking.userId !== req.userId) throw new RuleError(404, 'Booking not found')

    const paid = booking.status === 'CONFIRMED' || booking.status === 'COMPLETED'
    if (!paid) throw new RuleError(400, 'Only a paid trip can be rated')
    if (booking.schedule.departureTime.getTime() > Date.now()) {
      throw new RuleError(400, 'You can rate a trip after it has left')
    }

    const state = ratingState(booking)
    const existing = booking.rating
    // Only people the checker saw getting on the bus can rate (a rating already given can still be changed)
    if (!existing && !hasBoarded(booking)) {
      throw new RuleError(400, 'You can rate a trip after the ticket checker has marked you as boarded')
    }

    if (existing) {
      if (!state.canEdit) throw new RuleError(400, `A rating can only be changed for ${EDIT_WITHIN_DAYS} days after you gave it`)
      // A comment the admin hid stays as it is: only the stars can change
      if (existing.commentHiddenAt && comment !== existing.comment) {
        throw new RuleError(400, 'Your comment was hidden by the admin. You can only change the stars.')
      }
      const updated = await prisma.rating.update({ where: { id: existing.id }, data: { stars, comment } })
      res.json({ success: true, data: { rating: ownRating(updated) } })
      return
    }

    if (!state.canRate) throw new RuleError(400, `A trip can be rated for ${RATE_WITHIN_DAYS} days after it left`)

    try {
      const created = await prisma.rating.create({
        data: {
          bookingId: booking.id,
          userId: booking.userId!,
          operatorId: booking.schedule.bus.operatorId,
          busId: booking.schedule.busId,
          stars,
          comment,
        },
      })
      res.status(201).json({ success: true, data: { rating: ownRating(created) } })
    } catch (e) {
      // Two taps at once: the other one won
      if (isUniqueError(e)) throw new RuleError(409, 'This trip was already rated')
      throw e
    }
  } catch (error) {
    fail(res, error, 'RateBooking')
  }
}

/** What the passenger sees of their own rating. */
export const ownRating = (r: {
  id: string
  stars: number
  comment: string | null
  commentHiddenAt: Date | null
  createdAt: Date
  updatedAt: Date
}) => ({
  id: r.id,
  stars: r.stars,
  comment: r.comment,
  // The admin hid the comment: the passenger can still change the stars only
  commentHidden: r.commentHiddenAt !== null,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
})

// ─── Company: its own ratings ────────────────────────────
export const getMyRatings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const operatorId = companyOf(req, res)
    if (!operatorId) return

    const [total, byStars, byBus, buses, recent] = await Promise.all([
      prisma.rating.aggregate({ where: { operatorId }, _avg: { stars: true }, _count: { _all: true } }),
      prisma.rating.groupBy({ by: ['stars'], where: { operatorId }, _count: { _all: true } }),
      prisma.rating.groupBy({ by: ['busId'], where: { operatorId }, _avg: { stars: true }, _count: { _all: true } }),
      prisma.bus.findMany({ where: { operatorId }, select: { id: true, plateNumber: true, busType: true } }),
      prisma.rating.findMany({
        where: { operatorId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: { select: { name: true } },
          bus: { select: { plateNumber: true } },
          booking: { select: { schedule: { select: { departureTime: true, route: { select: { fromCity: true, toCity: true } } } } } },
        },
      }),
    ])

    const count = total._count._all
    const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
    for (const g of byStars) distribution[String(g.stars)] = g._count._all
    const busById = new Map(buses.map((b) => [b.id, b]))

    res.json({
      success: true,
      data: {
        average: count > 0 && total._avg.stars !== null ? round1(total._avg.stars) : null,
        count,
        distribution,
        // Passengers see the average only from this many ratings
        publicFrom: MIN_PUBLIC_RATINGS,
        publiclyShown: count >= MIN_PUBLIC_RATINGS,
        // How each bus does: for the company and the admin only, never public
        buses: byBus
          .map((g) => ({
            busId: g.busId,
            plateNumber: busById.get(g.busId)?.plateNumber ?? '',
            busType: busById.get(g.busId)?.busType ?? null,
            average: g._avg.stars !== null ? round1(g._avg.stars) : null,
            count: g._count._all,
          }))
          .sort((a, b) => b.count - a.count),
        // A hidden comment is not sent at all: the company only sees the stars
        recent: recent.map((r) => ({
          id: r.id,
          stars: r.stars,
          comment: r.commentHiddenAt ? null : r.comment,
          commentHidden: r.commentHiddenAt !== null,
          passenger: firstName(r.user.name),
          plateNumber: r.bus.plateNumber,
          fromCity: r.booking.schedule.route.fromCity,
          toCity: r.booking.schedule.route.toCity,
          departureTime: r.booking.schedule.departureTime,
          createdAt: r.createdAt,
        })),
      },
    })
  } catch (error) {
    fail(res, error, 'GetMyRatings')
  }
}

// ─── Admin: all ratings, hide an abusive comment ─────────
export const listRatings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const operatorId = typeof req.query.operatorId === 'string' && req.query.operatorId ? req.query.operatorId : undefined
    const onlyHidden = req.query.hidden === 'true'
    const where = { ...(operatorId ? { operatorId } : {}), ...(onlyHidden ? { commentHiddenAt: { not: null } } : {}) }
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 200)
    const page = Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1)

    const [rows, total, groups] = await Promise.all([
      prisma.rating.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { name: true } },
          operator: { select: { companyName: true } },
          bus: { select: { plateNumber: true } },
          booking: { select: { schedule: { select: { departureTime: true, route: { select: { fromCity: true, toCity: true } } } } } },
        },
      }),
      prisma.rating.count({ where }),
      prisma.rating.groupBy({ by: ['operatorId'], _avg: { stars: true }, _count: { _all: true } }),
    ])

    const companies = await prisma.operator.findMany({
      where: { id: { in: groups.map((g) => g.operatorId) } },
      select: { id: true, companyName: true },
    })
    const nameOf = new Map(companies.map((c) => [c.id, c.companyName]))

    res.json({
      success: true,
      data: {
        companies: groups
          .map((g) => ({
            operatorId: g.operatorId,
            companyName: nameOf.get(g.operatorId) ?? '',
            average: g._avg.stars !== null ? round1(g._avg.stars) : null,
            count: g._count._all,
            publiclyShown: g._count._all >= MIN_PUBLIC_RATINGS,
          }))
          .sort((a, b) => b.count - a.count),
        ratings: rows.map((r) => ({
          id: r.id,
          stars: r.stars,
          comment: r.comment,
          commentHidden: r.commentHiddenAt !== null,
          commentHiddenReason: r.commentHiddenReason,
          passenger: r.user.name,
          companyName: r.operator.companyName,
          plateNumber: r.bus.plateNumber,
          fromCity: r.booking.schedule.route.fromCity,
          toCity: r.booking.schedule.route.toCity,
          departureTime: r.booking.schedule.departureTime,
          createdAt: r.createdAt,
        })),
        total,
        page,
        limit,
      },
    })
  } catch (error) {
    fail(res, error, 'ListRatings')
  }
}

export const hideRatingComment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Give a reason' })
      return
    }
    const id = req.params.id as string
    const rating = await prisma.rating.findUnique({ where: { id }, select: { id: true, comment: true } })
    if (!rating) throw new RuleError(404, 'Rating not found')
    if (!rating.comment) throw new RuleError(400, 'This rating has no comment to hide')
    await prisma.rating.update({ where: { id }, data: { commentHiddenAt: new Date(), commentHiddenReason: parsed.data.reason } })
    res.json({ success: true, data: { id, commentHidden: true } })
  } catch (error) {
    fail(res, error, 'HideRatingComment')
  }
}

export const unhideRatingComment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string
    const rating = await prisma.rating.findUnique({ where: { id }, select: { id: true } })
    if (!rating) throw new RuleError(404, 'Rating not found')
    await prisma.rating.update({ where: { id }, data: { commentHiddenAt: null, commentHiddenReason: null } })
    res.json({ success: true, data: { id, commentHidden: false } })
  } catch (error) {
    fail(res, error, 'UnhideRatingComment')
  }
}
