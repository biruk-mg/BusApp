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

const personSelect = {
  id: true,
  seatNumber: true,
  name: true,
  phone: true,
  boardedAt: true,
  pickupPoint: { select: { id: true, name: true, sequence: true, offsetMin: true } },
  dropoffPoint: { select: { name: true } },
  boardedByStaff: { select: { user: { select: { name: true } } } },
} satisfies Prisma.BookingPassengerSelect

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
  // One row per seat. Tickets sold before passengers were recorded have none.
  passengers: { orderBy: { seatNumber: 'asc' }, select: personSelect },
} satisfies Prisma.BookingSelect

type PassengerRow = Prisma.BookingGetPayload<{ select: typeof passengerSelect }>

/**
 * The lines of the checker's screen for one ticket: one line per passenger (one per
 * seat), each with their own name, stops and boarding. A ticket from before passengers
 * were recorded is one line for the whole booking, as it always was.
 * A line's id is the passenger's id, or the booking's id for such an older ticket.
 */
function shapePassengers(b: PassengerRow) {
  const contactPhone = b.passengerPhone || b.user?.phone || null
  if (b.passengers.length === 0) {
    return [{
      id: b.id,
      bookingId: b.id,
      scheduleId: b.scheduleId,
      source: b.source,
      name: b.passengerName || b.user?.name || 'Passenger',
      phone: contactPhone,
      seatNumbers: b.seatNumbers,
      ticketCode: b.ticketCode,
      pickupPoint: b.pickupPoint,
      dropoffPoint: b.dropoffPoint?.name ?? null,
      boarded: b.boardedAt !== null,
      boardedAt: b.boardedAt,
      boardedBy: b.boardedByStaff?.user.name ?? null,
      groupSize: 1,
    }]
  }
  return b.passengers.map((p) => ({
    id: p.id,
    bookingId: b.id,
    scheduleId: b.scheduleId,
    source: b.source,
    name: p.name,
    // A passenger with no phone of their own can be reached through whoever booked
    phone: p.phone || contactPhone,
    seatNumbers: [p.seatNumber],
    ticketCode: b.ticketCode,
    pickupPoint: p.pickupPoint,
    dropoffPoint: p.dropoffPoint?.name ?? null,
    boarded: p.boardedAt !== null,
    boardedAt: p.boardedAt,
    boardedBy: p.boardedByStaff?.user.name ?? null,
    groupSize: b.passengers.length,
  }))
}

type Line = ReturnType<typeof shapePassengers>[number]

/** The whole ticket as one summary (for the screen that shows a scanned ticket). */
function summarize(lines: Line[]): Line {
  const first = lines[0]
  return {
    ...first,
    id: first.bookingId,
    name: lines.length > 1 ? `${first.name} +${lines.length - 1}` : first.name,
    seatNumbers: lines.flatMap((l) => l.seatNumbers),
    boarded: lines.every((l) => l.boarded),
    boardedAt: lines.every((l) => l.boarded) ? first.boardedAt : null,
  }
}

/** How many seats of these tickets have boarded, counting per passenger where it is recorded. */
function boardedSeatCount(bookings: { seatNumbers: string[]; boardedAt: Date | null; passengers: { boardedAt: Date | null }[] }[]): number {
  return bookings.reduce((n, b) => n + (b.passengers.length > 0
    ? b.passengers.filter((p) => p.boardedAt).length
    : b.boardedAt ? b.seatNumbers.length : 0), 0)
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
        bookings: { where: { status: { in: [...BOARDABLE] } }, select: { seatNumbers: true, boardedAt: true, passengers: { select: { boardedAt: true } } } },
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
          boardedSeats: boardedSeatCount(bookings),
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
    const passengers = sortPassengers(bookings.flatMap(shapePassengers))

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
// The id is one passenger's id (every ticket sold now) or a whole ticket's id (then it
// ticks everyone on it, and is also how tickets from before passengers were recorded work).
// Safe to repeat: ticking someone already ticked changes nothing (so a retry after a
// network drop, or two checkers on one door, can't break anything or hide who ticked first).
async function setBoarded(req: AuthRequest, res: Response, boarded: boolean): Promise<void> {
  try {
    const id = req.params.id as string
    const mine = { schedule: { bus: { operatorId: req.operatorId } } }

    const person = await prisma.bookingPassenger.findFirst({
      where: { id, booking: mine },
      select: { id: true, bookingId: true, booking: { select: { status: true } } },
    })
    const ticket = person
      ? null
      : await prisma.booking.findFirst({
          where: { id, ...mine },
          select: { id: true, status: true, passengers: { select: { id: true } } },
        })
    if (!person && !ticket) {
      res.status(404).json({ success: false, error: 'Ticket not found' })
      return
    }
    const status = person ? person.booking.status : ticket!.status
    if (!(BOARDABLE as readonly string[]).includes(status)) {
      res.status(409).json({ success: false, error: 'This ticket is not valid (unpaid, expired or voided)' })
      return
    }
    const bookingId = person ? person.bookingId : ticket!.id

    // Only change rows that are not already in the wanted state
    const wanted = boarded ? null : { not: null }
    const data = boarded
      ? { boardedAt: new Date(), boardedByStaffId: req.staffId }
      : { boardedAt: null, boardedByStaffId: null }
    let changed: { count: number }
    if (person) {
      changed = await prisma.bookingPassenger.updateMany({ where: { id: person.id, boardedAt: wanted }, data })
    } else if (ticket!.passengers.length > 0) {
      changed = await prisma.bookingPassenger.updateMany({ where: { bookingId, boardedAt: wanted }, data })
    } else {
      changed = await prisma.booking.updateMany({ where: { id: bookingId, boardedAt: wanted }, data })
    }

    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: passengerSelect })
    const lines = shapePassengers(updated)
    const line = lines.find((l) => l.id === id) ?? summarize(lines)
    // alreadyBoarded: someone else ticked this passenger first (a second checker, or a
    // ticket shown twice). The screen warns, so a reused ticket does not pass quietly.
    res.json({ success: true, data: { passenger: line, passengers: lines, alreadyBoarded: boarded && changed.count === 0 } })
  } catch (error) {
    console.error('SetBoarded error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

export const boardPassenger = (req: AuthRequest, res: Response) => setBoarded(req, res, true)
export const unboardPassenger = (req: AuthRequest, res: Response) => setBoarded(req, res, false)

// ─── Find a ticket by its code ───────────────────────────
// For a code typed or scanned at the door. Says whether the ticket is usable, so the
// checker is warned about voided tickets and tickets already used. Returns every
// passenger on the ticket, each with their own boarding state.
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
    const lines = shapePassengers(rest)
    const summary = summarize(lines)
    const valid = (BOARDABLE as readonly string[]).includes(booking.status)
    res.json({
      success: true,
      data: {
        state: !valid ? 'VOIDED' : summary.boarded ? 'ALREADY_BOARDED' : 'OK',
        passenger: summary,
        passengers: lines,
        trip: schedule,
      },
    })
  } catch (error) {
    console.error('LookupTicket error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
