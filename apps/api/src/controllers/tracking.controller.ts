import { Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import {
  START_EARLY_HOURS,
  START_LATE_HOURS,
  FOLLOW_AFTER_HOURS,
  FOLLOW_BEFORE_HOURS,
  canStartNow,
  choosePickup,
  positionBody,
  recordedAtProblem,
  shapeTracking,
  tripPhase,
} from '../lib/tracking'
import { onLocation } from '../lib/arrivalAlertRunner'

/**
 * Live tracking. The checker routes are for staff of ONE company: the company always comes
 * from the staff middleware (req.operatorId), never from the request. Another company's
 * trip looks exactly like one that doesn't exist.
 */

const PAID = ['CONFIRMED', 'COMPLETED']

const fail = (res: Response, status: number, error: string) => res.status(status).json({ success: false, error })
const serverError = (res: Response, name: string, error: unknown) => {
  console.error(`${name} error:`, error)
  res.status(500).json({ success: false, error: 'Internal server error' })
}

const ownTrip = (req: AuthRequest) =>
  prisma.schedule.findFirst({
    where: { id: req.params.id as string, bus: { operatorId: req.operatorId } },
    select: { id: true, departureTime: true, startedAt: true, endedAt: true },
  })

/** POST /checkin/trips/:id/start */
export const startTrip = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const trip = await ownTrip(req)
    if (!trip) return void fail(res, 404, 'Trip not found')
    const phase = tripPhase(trip)
    if (phase === 'ENDED') return void fail(res, 409, 'This trip has already ended')
    if (phase === 'LIVE') return void fail(res, 409, 'This trip has already started')
    if (!canStartNow(trip.departureTime)) {
      return void fail(res, 400, `A trip can be started from ${START_EARLY_HOURS} hours before it leaves until ${START_LATE_HOURS} hours after`)
    }

    // The condition inside the update means two checkers pressing Start at once cannot both win
    const now = new Date()
    const done = await prisma.schedule.updateMany({ where: { id: trip.id, startedAt: null, endedAt: null }, data: { startedAt: now } })
    if (done.count === 0) return void fail(res, 409, 'This trip has already started')

    res.json({ success: true, data: { trip: { id: trip.id, startedAt: now, endedAt: null } } })
  } catch (error) {
    serverError(res, 'StartTrip', error)
  }
}

/** POST /checkin/trips/:id/end  (the live position is removed) */
export const endTrip = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const trip = await ownTrip(req)
    if (!trip) return void fail(res, 404, 'Trip not found')
    const phase = tripPhase(trip)
    if (phase === 'ENDED') return void fail(res, 409, 'This trip has already ended')
    if (phase === 'NOT_STARTED') return void fail(res, 409, 'This trip has not started yet')

    const now = new Date()
    const result = await prisma.$transaction(async (tx) => {
      const done = await tx.schedule.updateMany({ where: { id: trip.id, startedAt: { not: null }, endedAt: null }, data: { endedAt: now } })
      if (done.count === 0) return null
      await tx.tripPosition.deleteMany({ where: { scheduleId: trip.id } })
      return done
    })
    if (!result) return void fail(res, 409, 'This trip has already ended')

    res.json({ success: true, data: { trip: { id: trip.id, startedAt: trip.startedAt, endedAt: now } } })
  } catch (error) {
    serverError(res, 'EndTrip', error)
  }
}

/** POST /checkin/trips/:id/location  (the checker's phone sends where the bus is) */
export const sendLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = positionBody.safeParse(req.body)
    if (!parsed.success) return void fail(res, 400, 'Invalid position: send lat and lng as numbers')
    const body = parsed.data

    const trip = await ownTrip(req)
    if (!trip) return void fail(res, 404, 'Trip not found')
    const phase = tripPhase(trip)
    if (phase === 'ENDED') return void fail(res, 409, 'This trip has already ended')
    if (phase === 'NOT_STARTED') return void fail(res, 409, 'Start the trip first')

    const now = new Date()
    const recordedAt = body.recordedAt ? new Date(body.recordedAt) : now
    const problem = recordedAtProblem(recordedAt, now)
    if (problem) return void fail(res, 400, problem)

    const values = {
      lat: body.lat,
      lng: body.lng,
      accuracy: body.accuracy ?? null,
      speed: body.speed ?? null,
      heading: body.heading ?? null,
      recordedAt,
    }

    // The newest position wins: a phone that was offline and sends an old one later must not
    // move the bus backwards.
    const updated = await prisma.tripPosition.updateMany({ where: { scheduleId: trip.id, recordedAt: { lt: recordedAt } }, data: values })
    let stored = updated.count > 0
    if (!stored) {
      try {
        await prisma.tripPosition.create({ data: { scheduleId: trip.id, ...values } })
        stored = true
      } catch (error) {
        // A row already exists with a newer (or equal) time: this position is simply older
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error
      }
    }

    res.json({ success: true, data: { stored } })

    // After the answer has gone: the checker's phone never waits for the alerts, and a problem
    // with them can never turn a stored position into an error.
    if (stored) onLocation(trip.id).catch((error) => console.error('ArrivalAlerts error:', error))
  } catch (error) {
    serverError(res, 'SendLocation', error)
  }
}

/** GET /bookings/:id/tracking  (the passenger who owns a paid booking) */
export const getBookingTracking = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id as string },
      select: {
        userId: true,
        status: true,
        pickupPoint: { select: { name: true, lat: true, lng: true } },
        passengers: { select: { seatNumber: true, pickupPoint: { select: { name: true, lat: true, lng: true } } } },
        schedule: { select: { startedAt: true, endedAt: true, position: true } },
      },
    })
    // Someone else's booking, an unpaid or cancelled one: all look like "not found"
    if (!booking || booking.userId !== req.userId || !PAID.includes(booking.status)) {
      return void fail(res, 404, 'Booking not found')
    }
    res.json({ success: true, data: { tracking: shapeTracking(booking.schedule, new Date(), choosePickup(booking)) } })
  } catch (error) {
    serverError(res, 'GetBookingTracking', error)
  }
}

/**
 * GET /bookings/tracking/next  (the "Track my bus" button on the home page)
 * The passenger's own paid ONLINE booking whose bus can be followed now: a trip that is live
 * comes first, then the one leaving soonest. Counter tickets never count. Null when there is none.
 */
export const getNextTrackableBooking = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const HOUR = 60 * 60 * 1000
    const now = Date.now()
    const bookings = await prisma.booking.findMany({
      where: {
        userId: req.userId,
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        source: 'ONLINE',
        schedule: {
          endedAt: null,
          departureTime: { gt: new Date(now - FOLLOW_AFTER_HOURS * HOUR), lt: new Date(now + FOLLOW_BEFORE_HOURS * HOUR) },
        },
      },
      select: {
        id: true,
        schedule: { select: { startedAt: true, departureTime: true, route: { select: { fromCity: true, toCity: true } } } },
      },
      orderBy: { schedule: { departureTime: 'asc' } },
      take: 10,
    })
    // Live trips first, then by departure (already in that order within each group)
    const best = bookings.find((b) => b.schedule.startedAt) ?? bookings[0]
    res.json({
      success: true,
      data: {
        next: best
          ? {
              bookingId: best.id,
              live: !!best.schedule.startedAt,
              departureTime: best.schedule.departureTime,
              fromCity: best.schedule.route.fromCity,
              toCity: best.schedule.route.toCity,
            }
          : null,
      },
    })
  } catch (error) {
    serverError(res, 'GetNextTrackableBooking', error)
  }
}
