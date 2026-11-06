import { Request, Response } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { getOperatorForUser } from '../lib/operator'
import { activeBookingFilter, releaseExpiredHolds } from '../lib/seats'
import { addisDayRange, isValidDateString } from '../lib/time'
import { maybeTopUp } from '../lib/recurring'

const createScheduleSchema = z.object({
  routeId: z.string(),
  busId: z.string(),
  departureTime: z.string().datetime(),
  arrivalTime: z.string().datetime(),
  price: z.number().positive(),
})

const BUS_TYPES = ['STANDARD', 'LUXURY', 'MINIBUS'] as const
type BusTypeValue = (typeof BUS_TYPES)[number]

// ─── Search (public) ─────────────────────────────────────
// Only upcoming, open trips are ever returned. All filters are optional:
//   fromCity, toCity, date (YYYY-MM-DD, an Addis Ababa calendar day),
//   busType, operator (name contains), operatorId, maxPrice, sort=time|price
export const searchSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const fromCity = (req.query.fromCity as string | undefined)?.trim()
    const toCity = (req.query.toCity as string | undefined)?.trim()
    const date = req.query.date as string | undefined
    const busType = req.query.busType as string | undefined
    const operator = (req.query.operator as string | undefined)?.trim()
    const operatorId = (req.query.operatorId as string | undefined)?.trim()
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined
    const sort = req.query.sort === 'price' ? 'price' : 'time'

    // Keep recurring schedules topped up (in the background, at most hourly)
    maybeTopUp()

    const now = new Date()
    const where: Prisma.ScheduleWhereInput = { departureTime: { gte: now }, status: 'OPEN' }

    if (date) {
      if (!isValidDateString(date)) {
        res.status(400).json({ success: false, error: 'Invalid date' })
        return
      }
      // The day is an Addis Ababa day (UTC+3), whatever time zone the server uses
      const { start, end } = addisDayRange(date)
      // Never go earlier than "now", even when searching for today
      where.departureTime = { gte: start > now ? start : now, lt: end }
    }

    const routeFilter: Prisma.RouteWhereInput = {}
    if (fromCity) routeFilter.fromCity = { equals: fromCity, mode: 'insensitive' }
    if (toCity) routeFilter.toCity = { equals: toCity, mode: 'insensitive' }
    if (fromCity || toCity) where.route = routeFilter

    const busFilter: Prisma.BusWhereInput = {}
    if (busType && BUS_TYPES.includes(busType as BusTypeValue)) {
      busFilter.busType = busType as BusTypeValue
    }
    if (operator) {
      busFilter.operator = { companyName: { contains: operator, mode: 'insensitive' } }
    }
    if (operatorId) busFilter.operatorId = operatorId
    if (Object.keys(busFilter).length > 0) where.bus = busFilter

    if (maxPrice !== undefined && Number.isFinite(maxPrice)) where.price = { lte: maxPrice }

    const schedules = await prisma.schedule.findMany({
      where,
      include: {
        route: true,
        bus: { include: { operator: true } },
        _count: { select: { bookings: true } },
        // Seats held by paid bookings and unpaid bookings still inside their hold
        bookings: {
          where: activeBookingFilter(now),
          select: { seatNumbers: true },
        },
      },
      orderBy: sort === 'price' ? [{ price: 'asc' }, { departureTime: 'asc' }] : { departureTime: 'asc' },
      take: 100,
    })

    const schedulesWithAvailability = schedules.map(({ bookings, ...schedule }) => {
      const bookedSeats = bookings.reduce((n, b) => n + b.seatNumbers.length, 0)
      return {
        ...schedule,
        availableSeats: Math.max(0, schedule.bus.totalSeats - bookedSeats),
        totalSeats: schedule.bus.totalSeats,
      }
    })

    res.json({
      success: true,
      data: { schedules: schedulesWithAvailability, total: schedulesWithAvailability.length },
    })
  } catch (error) {
    console.error('SearchSchedules error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── List all (upcoming by default; ?includePast=true for history) ──
// Closed trips are hidden unless ?includeClosed=true (used by the admin page).
export const getAllSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const includePast = req.query.includePast === 'true'
    const includeClosed = req.query.includeClosed === 'true'
    const schedules = await prisma.schedule.findMany({
      where: {
        ...(includePast ? {} : { departureTime: { gte: new Date() } }),
        ...(includeClosed ? {} : { status: 'OPEN' as const }),
      },
      include: {
        route: true,
        bus: { include: { operator: true } },
        _count: { select: { bookings: true } },
      },
      orderBy: { departureTime: 'asc' },
    })
    res.json({ success: true, data: { schedules, total: schedules.length } })
  } catch (error) {
    console.error('GetAllSchedules error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── One trip with seats left (public) ───────────────────
// Used by the seat page. Closed trips are returned too (with status CLOSED),
// so the page can tell the passenger instead of showing "not found".
export const getScheduleById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string
    const schedule = await prisma.schedule.findUnique({
      where: { id },
      include: {
        route: true,
        bus: { include: { operator: true } },
        bookings: { where: activeBookingFilter(), select: { seatNumbers: true } },
      },
    })
    if (!schedule) {
      res.status(404).json({ success: false, error: 'Schedule not found' })
      return
    }
    const { bookings, ...rest } = schedule
    const booked = bookings.reduce((n, b) => n + b.seatNumbers.length, 0)
    res.json({
      success: true,
      data: {
        schedule: { ...rest, availableSeats: Math.max(0, schedule.bus.totalSeats - booked), totalSeats: schedule.bus.totalSeats },
      },
    })
  } catch (error) {
    console.error('GetScheduleById error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Create (operator for own buses, or admin) ───────────
export const createSchedule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = createScheduleSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }

    const { routeId, busId, departureTime, arrivalTime, price } = parsed.data
    const departure = new Date(departureTime)
    const arrival = new Date(arrivalTime)

    if (departure <= new Date()) {
      res.status(400).json({ success: false, error: 'Departure time must be in the future' })
      return
    }
    if (arrival <= departure) {
      res.status(400).json({ success: false, error: 'Arrival time must be after departure time' })
      return
    }

    const [bus, route] = await Promise.all([
      prisma.bus.findUnique({ where: { id: busId } }),
      prisma.route.findUnique({ where: { id: routeId } }),
    ])
    if (!bus) {
      res.status(404).json({ success: false, error: 'Bus not found' })
      return
    }
    if (!route) {
      res.status(404).json({ success: false, error: 'Route not found' })
      return
    }

    // Operators may only schedule their own buses
    if (req.userRole === 'OPERATOR') {
      const operator = await getOperatorForUser(req.userId!)
      if (!operator || bus.operatorId !== operator.id) {
        res.status(403).json({ success: false, error: 'You can only schedule your own buses' })
        return
      }
    }

    // A bus can't be in two places at once
    const overlapping = await prisma.schedule.findFirst({
      where: { busId, departureTime: { lt: arrival }, arrivalTime: { gt: departure } },
    })
    if (overlapping) {
      res.status(409).json({
        success: false,
        error: 'This bus already has a trip that overlaps with this time',
      })
      return
    }

    const schedule = await prisma.schedule.create({
      data: { routeId, busId, departureTime: departure, arrivalTime: arrival, price },
      include: { route: true, bus: true },
    })

    res.status(201).json({ success: true, message: 'Schedule created', data: { schedule } })
  } catch (error) {
    console.error('CreateSchedule error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Delete (operator for own trips, or admin; only if no bookings) ──
export const deleteSchedule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string

    const schedule = await prisma.schedule.findUnique({
      where: { id },
      include: { bus: true, _count: { select: { bookings: true } } },
    })
    if (!schedule) {
      res.status(404).json({ success: false, error: 'Schedule not found' })
      return
    }

    if (req.userRole === 'OPERATOR') {
      const operator = await getOperatorForUser(req.userId!)
      if (!operator || schedule.bus.operatorId !== operator.id) {
        res.status(403).json({ success: false, error: 'You can only delete your own schedules' })
        return
      }
    }

    if (schedule._count.bookings > 0) {
      res.status(409).json({
        success: false,
        error: 'This trip already has bookings, so it cannot be deleted',
      })
      return
    }

    // Trips made by a recurring schedule would simply be created again
    if (schedule.templateId) {
      res.status(409).json({
        success: false,
        error: 'This trip belongs to a recurring schedule. Close it, or pause the recurring schedule.',
      })
      return
    }

    await prisma.schedule.delete({ where: { id } })
    res.json({ success: true, message: 'Schedule deleted' })
  } catch (error) {
    console.error('DeleteSchedule error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Close / reopen one trip (operator for own trips, or admin) ──
// A closed trip takes no new bookings and disappears from search.
// Existing bookings are kept, and a passenger already paying can finish.
export const setScheduleStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = z.object({ status: z.enum(['OPEN', 'CLOSED']) }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'status must be OPEN or CLOSED' })
      return
    }

    const id = req.params.id as string
    const schedule = await prisma.schedule.findUnique({ where: { id }, include: { bus: true } })
    if (!schedule) {
      res.status(404).json({ success: false, error: 'Schedule not found' })
      return
    }

    if (req.userRole === 'OPERATOR') {
      const operator = await getOperatorForUser(req.userId!)
      if (!operator || schedule.bus.operatorId !== operator.id) {
        res.status(403).json({ success: false, error: 'You can only change your own schedules' })
        return
      }
    }

    if (schedule.departureTime < new Date()) {
      res.status(400).json({ success: false, error: 'This trip has already departed' })
      return
    }

    const updated = await prisma.schedule.update({
      where: { id },
      data: { status: parsed.data.status },
    })
    res.json({
      success: true,
      message: parsed.data.status === 'CLOSED' ? 'Trip closed' : 'Trip reopened',
      data: { schedule: updated },
    })
  } catch (error) {
    console.error('SetScheduleStatus error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Seat map data for one trip (public) ─────────────────
// Returns which seats are taken, for everyone. No passenger details.
export const getScheduleSeats = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string
    const schedule = await prisma.schedule.findUnique({ where: { id }, include: { bus: true } })
    if (!schedule) {
      res.status(404).json({ success: false, error: 'Schedule not found' })
      return
    }

    await releaseExpiredHolds(prisma, { scheduleId: id })

    const bookings = await prisma.booking.findMany({
      where: { scheduleId: id, ...activeBookingFilter() },
      select: { seatNumbers: true },
    })

    const points = await prisma.pickupPoint.findMany({
      where: { operatorId: schedule.bus.operatorId, routeId: schedule.routeId },
      orderBy: [{ sequence: 'asc' }, { offsetMin: 'asc' }],
      select: { id: true, name: true, kind: true, sequence: true, offsetMin: true },
    })

    res.json({
      success: true,
      data: {
        status: schedule.status,
        totalSeats: schedule.bus.totalSeats,
        bookedSeats: bookings.flatMap((b) => b.seatNumbers),
        pickupPoints: points.filter((p) => p.kind !== 'DROPOFF'),
        dropoffPoints: points.filter((p) => p.kind !== 'PICKUP'),
      },
    })
  } catch (error) {
    console.error('GetScheduleSeats error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
