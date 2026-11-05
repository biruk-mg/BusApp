import { Request, Response } from 'express'
import { z } from 'zod'
import QRCode from 'qrcode'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { HOLD_MINUTES, activeBookingFilter, releaseExpiredHolds, seatLabels } from '../lib/seats'

// ─── Validation ─────────────────────────────────────────
const createBookingSchema = z.object({
  scheduleId: z.string(),
  seatNumbers: z.array(z.string()).min(1).max(10),
})

// ─── Create Booking ──────────────────────────────────────
export const createBooking = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = createBookingSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }

    const { scheduleId, seatNumbers } = parsed.data
    const userId = req.userId!

    if (new Set(seatNumbers).size !== seatNumbers.length) {
      res.status(400).json({ success: false, error: 'Each seat can only be selected once' })
      return
    }

    // Get schedule with bus info
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { bus: true },
    })

    if (!schedule) {
      res.status(404).json({ success: false, error: 'Schedule not found' })
      return
    }

    // Check departure time hasn't passed
    if (new Date(schedule.departureTime) < new Date()) {
      res.status(400).json({ success: false, error: 'This schedule has already departed' })
      return
    }

    // Only seats that exist on this bus can be booked
    const validSeats = new Set(seatLabels(schedule.bus.totalSeats))
    const unknownSeat = seatNumbers.find((seat) => !validSeats.has(seat))
    if (unknownSeat) {
      res.status(400).json({ success: false, error: `Seat ${unknownSeat} does not exist on this bus` })
      return
    }

    const now = new Date()

    const booking = await prisma.$transaction(async (tx) => {
      // One booking at a time per trip: this lock is what stops two people
      // from taking the same seat at the same moment.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scheduleId}))`

      // Free seats held by unpaid bookings that ran out of time
      await releaseExpiredHolds(tx, { scheduleId }, now)

      // Seats held by paid bookings and by unpaid bookings still inside their hold
      const existingBookings = await tx.booking.findMany({
        where: { scheduleId, ...activeBookingFilter(now) },
        select: { seatNumbers: true },
      })

      const bookedSeats = existingBookings.flatMap((b) => b.seatNumbers)

      // Check if any requested seat is already booked
      const conflictingSeat = seatNumbers.find((seat) => bookedSeats.includes(seat))
      if (conflictingSeat) {
        throw new Error(`Seat ${conflictingSeat} is already booked`)
      }

      // Check total seats not exceeded
      const totalBooked = bookedSeats.length + seatNumbers.length
      if (totalBooked > schedule.bus.totalSeats) {
        throw new Error('Not enough seats available')
      }

      // Calculate total price (always on the server, never trusted from the client)
      const totalPrice = schedule.price * seatNumbers.length

      // Generate unique QR code data
      const qrData = `BUS-${scheduleId}-${userId}-${Date.now()}`
      const qrCode = await QRCode.toDataURL(qrData)

      // Seats are reserved, not confirmed: the booking becomes CONFIRMED only
      // when Chapa confirms the payment.
      return tx.booking.create({
        data: {
          userId,
          scheduleId,
          seatNumbers,
          totalPrice,
          status: 'PENDING',
          expiresAt: new Date(now.getTime() + HOLD_MINUTES * 60 * 1000),
          qrCode,
        },
        include: {
          schedule: {
            include: { route: true, bus: true },
          },
        },
      })
    })

    res.status(201).json({
      success: true,
      message: `Seats reserved. Complete payment within ${HOLD_MINUTES} minutes to confirm your booking.`,
      data: { booking },
    })
  } catch (error) {
    const message = (error as Error).message
    if (message.includes('already booked') || message.includes('Not enough seats')) {
      res.status(409).json({ success: false, error: message })
      return
    }
    console.error('CreateBooking error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Get My Bookings ─────────────────────────────────────
export const getMyBookings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!

    await releaseExpiredHolds(prisma, { userId })

    const bookings = await prisma.booking.findMany({
      where: { userId },
      include: {
        schedule: {
          include: { route: true, bus: { include: { operator: true } } },
        },
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ success: true, data: { bookings, total: bookings.length } })
  } catch (error) {
    console.error('GetMyBookings error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Get Single Booking ──────────────────────────────────
export const getBooking = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string
    const userId = req.userId!

    await releaseExpiredHolds(prisma, { id })

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        schedule: {
          include: { route: true, bus: { include: { operator: true } } },
        },
        payment: true,
      },
    })

    if (!booking) {
      res.status(404).json({ success: false, error: 'Booking not found' })
      return
    }

    // Only owner or admin can view
    if (booking.userId !== userId && req.userRole !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Access denied' })
      return
    }

    res.json({ success: true, data: { booking } })
  } catch (error) {
    console.error('GetBooking error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Cancel Booking ──────────────────────────────────────
export const cancelBooking = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string
    const userId = req.userId!

    const booking = await prisma.booking.findUnique({ where: { id } })

    if (!booking) {
      res.status(404).json({ success: false, error: 'Booking not found' })
      return
    }

    // Only owner or admin can cancel
    if (booking.userId !== userId && req.userRole !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Access denied' })
      return
    }

    if (booking.status === 'CANCELLED') {
      res.status(400).json({ success: false, error: 'Booking already cancelled' })
      return
    }

    if (booking.status === 'COMPLETED') {
      res.status(400).json({ success: false, error: 'Cannot cancel a completed booking' })
      return
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: {
        schedule: { include: { route: true } },
      },
    })

    res.json({ success: true, message: 'Booking cancelled', data: { booking: updated } })
  } catch (error) {
    console.error('CancelBooking error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Get All Bookings (Admin) ────────────────────────────
export const getAllBookings = async (_req: Request, res: Response): Promise<void> => {
  try {
    const bookings = await prisma.booking.findMany({
      include: {
        user: { select: { id: true, name: true, phone: true } },
        schedule: { include: { route: true, bus: true } },
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ success: true, data: { bookings, total: bookings.length } })
  } catch (error) {
    console.error('GetAllBookings error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}