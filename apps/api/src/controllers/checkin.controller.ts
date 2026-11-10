import { Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { TICKET_CODE_RE } from '../lib/ticketCode'
import { addisDateString, addisDayRange, isValidDateString } from '../lib/time'

/**
 * Boarding: what the door helper (ticket checker) does instead of a paper list.
 * Every route here is for staff of ONE company: the company always comes from
 * the staff middleware (req.operatorId), never from the request. Another
 * company's trip or ticket looks exactly like one that doesn't exist.
 */

// Only paid tickets can board. PENDING (unpaid) and CANCELLED (expired or voided) never show.
const BOARDABLE = ['CONFIRMED', 'COMPLETED'] as const

const passengerSelect = {
  id: true,
  scheduleId: true,
  status: true,
  source: true,
  seatNumbers: true,
  passengerName: true,
  passengerPhone: true,
  ticketCode: true,
  boardedAt: true,
  user: { select: { name: true, phone: true } },
  pickupPoint: { select: { id: true, name: true, sequence: true, offsetMin: true } },
  dropoffPoint: { select: { name: true } },
  boardedByStaff: { select: { user: { select: { name: true } } } },
} satisfies Prisma.BookingSelect

type PassengerRow = Prisma.BookingGetPayload<{ select: typeof passengerSelect }>

/** One passenger as the checker's screen needs it. Online passengers use their account name and phone. */
function shapePassenger(b: PassengerRow) {
  return {
    id: b.id,
    scheduleId: b.scheduleId,
    source: b.source,
    name: b.passengerName || b.user?.name || 'Passenger',
    phone: b.passengerPhone || b.user?.phone || null,
    seatNumbers: b.seatNumbers,
    ticketCode: b.ticketCode,
    pickupPoint: b.pickupPoint,
    dropoffPoint: b.dropoffPoint?.name ?? null,
    boarded: b.boardedAt !== null,
    boardedAt: b.boardedAt,
    boardedBy: b.boardedByStaff?.user.name ?? null,
  }
}

/** Passengers in the order the bus meets them: by pickup point, then by seat. People with no pickup point go last. */
function sortPassengers<T extends { pickupPoint: { sequence: number; offsetMin: number } | null; seatNumbers: string[] }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const pa = a.pickupPoint, pb = b.pickupPoint
    if (pa && !pb) return -1
    if (!pa && pb) return 1
    if (pa && pb && (pa.sequence !== pb.sequence || pa.offsetMin !== pb.offsetMin)) {
      return pa.sequence - pb.sequence || pa.offsetMin - pb.offsetMin
    }
    return (a.seatNumbers[0] ?? '').localeCompare(b.seatNumbers[0] ?? '')
  })
}

// ─── The company's trips on one day ──────────────────────
// Includes closed trips and trips that already left: people with tickets still board.
export const listCheckinTrips = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const date = (req.query.date as string | undefined) || addisDateString(new Date())
    if (!isValidDateString(date)) {
      res.status(400).json({ success: false, error: 'Invalid date' })
      return
    }
    const day = addisDayRange(date)

    const trips = await prisma.schedule.findMany({
      where: { bus: { operatorId: req.operatorId }, departureTime: { gte: day.start, lt: day.end } },
      include: {
        route: { select: { fromCity: true, toCity: true } },
        bus: { select: { plateNumber: true, busType: true, totalSeats: true } },
        bookings: { where: { status: { in: [...BOARDABLE] } }, select: { seatNumbers: true, boardedAt: true } },
      },
      orderBy: { departureTime: 'asc' },
    })

    res.json({
      success: true,
      data: {
        date,
        trips: trips.map(({ bookings, ...t }) => ({
          ...t,
          soldSeats: bookings.reduce((n, b) => n + b.seatNumbers.length, 0),
          boardedSeats: bookings.filter((b) => b.boardedAt).reduce((n, b) => n + b.seatNumbers.length, 0),
        })),
      },
    })
  } catch (error) {
    console.error('ListCheckinTrips error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── The passenger list of one trip ──────────────────────
export const getTripPassengers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const trip = await prisma.schedule.findFirst({
      where: { id: req.params.id as string, bus: { operatorId: req.operatorId } },
      include: {
        route: { select: { fromCity: true, toCity: true } },
        bus: { select: { plateNumber: true, busType: true, totalSeats: true } },
      },
    })
    if (!trip) {
      res.status(404).json({ success: false, error: 'Trip not found' })
      return
    }

    const bookings = await prisma.booking.findMany({
      where: { scheduleId: trip.id, status: { in: [...BOARDABLE] } },
      select: passengerSelect,
    })
    const passengers = sortPassengers(bookings.map(shapePassenger))

    res.json({
      success: true,
      data: {
        trip,
        passengers,
        soldSeats: passengers.reduce((n, p) => n + p.seatNumbers.length, 0),
        boardedSeats: passengers.filter((p) => p.boarded).reduce((n, p) => n + p.seatNumbers.length, 0),
      },
    })
  } catch (error) {
    console.error('GetTripPassengers error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Tick / untick a passenger ───────────────────────────
// Safe to repeat: ticking someone already ticked changes nothing (so a retry after a
// network drop, or two checkers on one door, can't break anything or hide who ticked first).
async function setBoarded(req: AuthRequest, res: Response, boarded: boolean): Promise<void> {
  try {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id as string, schedule: { bus: { operatorId: req.operatorId } } },
      select: { id: true, status: true, boardedAt: true },
    })
    if (!booking) {
      res.status(404).json({ success: false, error: 'Ticket not found' })
      return
    }
    if (!(BOARDABLE as readonly string[]).includes(booking.status)) {
      res.status(409).json({ success: false, error: 'This ticket is not valid (unpaid, expired or voided)' })
      return
    }

    // Only change the row if it is not already in the wanted state
    const changed = await prisma.booking.updateMany({
      where: { id: booking.id, boardedAt: boarded ? null : { not: null } },
      data: boarded
        ? { boardedAt: new Date(), boardedByStaffId: req.staffId }
        : { boardedAt: null, boardedByStaffId: null },
    })

    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, select: passengerSelect })
    // alreadyBoarded: someone else ticked this passenger first (a second checker, or a
    // ticket shown twice). The screen warns, so a reused ticket does not pass quietly.
    res.json({ success: true, data: { passenger: shapePassenger(updated), alreadyBoarded: boarded && changed.count === 0 } })
  } catch (error) {
    console.error('SetBoarded error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

export const boardPassenger = (req: AuthRequest, res: Response) => setBoarded(req, res, true)
export const unboardPassenger = (req: AuthRequest, res: Response) => setBoarded(req, res, false)

// ─── Find a ticket by its code ───────────────────────────
// For a code typed or scanned at the door. Says whether the ticket is usable, so the
// checker is warned about voided tickets and tickets already used.
export const lookupTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const code = String(req.params.code ?? '').trim().toUpperCase()
    if (!TICKET_CODE_RE.test(code)) {
      res.status(404).json({ success: false, error: 'Ticket not found' })
      return
    }

    const booking = await prisma.booking.findFirst({
      where: { ticketCode: code, schedule: { bus: { operatorId: req.operatorId } } },
      select: {
        ...passengerSelect,
        schedule: { select: { id: true, departureTime: true, route: { select: { fromCity: true, toCity: true } }, bus: { select: { plateNumber: true } } } },
      },
    })
    if (!booking) {
      res.status(404).json({ success: false, error: 'Ticket not found' })
      return
    }

    const { schedule, ...rest } = booking
    const valid = (BOARDABLE as readonly string[]).includes(booking.status)
    res.json({
      success: true,
      data: {
        state: !valid ? 'VOIDED' : booking.boardedAt ? 'ALREADY_BOARDED' : 'OK',
        passenger: shapePassenger(rest),
        trip: schedule,
      },
    })
  } catch (error) {
    console.error('LookupTicket error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
