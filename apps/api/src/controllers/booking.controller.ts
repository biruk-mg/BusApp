import { Request, Response } from 'express'
import { z } from 'zod'
import QRCode from 'qrcode'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

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

    // Use transaction to prevent double booking
    const booking = await prisma.$transaction(async (tx) => {
      // Get all booked seats for this schedule
      const existingBookings = await tx.booking.findMany({
        where: {
          scheduleId,
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
        select: { seatNumbers: true },
      })

      // Flatten all booked seat numbers
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

      // Calculate total price
      const totalPrice = schedule.price * seatNumbers.length

      // Generate unique QR code data
      const qrData = `BUS-${scheduleId}-${userId}-${Date.now()}`
      const qrCode = await QRCode.toDataURL(qrData)

      // Create booking
      const newBooking = await tx.booking.create({
        data: {
          userId,
          scheduleId,
          seatNumbers,
          totalPrice,
          status: 'CONFIRMED',
          qrCode,
        },
        include: {
          schedule: {
            include: { route: true, bus: true },
          },
        },
      })

      return newBooking
    })

    res.status(201).json({
      success: true,
      message: 'Booking confirmed!',
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