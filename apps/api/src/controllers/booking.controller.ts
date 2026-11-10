import { Request, Response } from 'express'
import { z } from 'zod'
import QRCode from 'qrcode'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { HOLD_MINUTES, releaseExpiredHolds } from '../lib/seats'
import { PUBLIC_OPERATOR_FIELDS } from '../lib/visibility'
import { SaleError, validateTripForSale, lockAndCheckSeats } from '../lib/sales'
import { generateTicketCode } from '../lib/ticketCode'

// ─── Validation ─────────────────────────────────────────
const createBookingSchema = z.object({
  pickupPointId: z.string().optional(),
  dropoffPointId: z.string().optional(),
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
    const pickupPointId = parsed.data.pickupPointId || undefined
    const dropoffPointId = parsed.data.dropoffPointId || undefined
    const userId = req.userId!

    const schedule = await validateTripForSale({ channel: 'ONLINE', scheduleId, seatNumbers, pickupPointId, dropoffPointId })
    const now = new Date()

    // Every ticket gets a short code (the same kind counter tickets have) and the
    // QR code on it holds that code, so a ticket checker can verify an online
    // ticket on the server: by scanning the QR or typing the code.
    let booking
    for (let attempt = 0; ; attempt++) {
      try {
        booking = await prisma.$transaction(async (tx) => {
          await lockAndCheckSeats(tx, schedule, seatNumbers, now)

          // Calculate total price (always on the server, never trusted from the client)
          const totalPrice = schedule.price * seatNumbers.length

          const ticketCode = generateTicketCode()
          const qrCode = await QRCode.toDataURL(ticketCode)

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
              pickupPointId: pickupPointId ?? null,
              dropoffPointId: dropoffPointId ?? null,
              ticketCode,
              qrCode,
            },
            include: {
              pickupPoint: true,
              dropoffPoint: true,
              schedule: {
                include: { route: true, bus: true },
              },
            },
          })
        })
        break
      } catch (error) {
        // Very rarely the random code is already taken: try again with a new one
        if ((error as { code?: string })?.code === 'P2002' && attempt < 4) continue
        throw error
      }
    }

    res.status(201).json({
      success: true,
      message: `Seats reserved. Complete payment within ${HOLD_MINUTES} minutes to confirm your booking.`,
      data: { booking },
    })
  } catch (error) {
    if (error instanceof SaleError) {
      res.status(error.status).json({ success: false, error: error.message })
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
          include: { route: true, bus: { include: { operator: PUBLIC_OPERATOR_FIELDS } } },
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
        pickupPoint: true,
        dropoffPoint: true,
        schedule: {
          include: { route: true, bus: { include: { operator: PUBLIC_OPERATOR_FIELDS } } },
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

    // Counter tickets were paid at the counter: only staff can void them
    if (booking.source === 'COUNTER') {
      res.status(403).json({ success: false, error: 'This ticket was sold at the counter. Please ask the bus company to cancel it.' })
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