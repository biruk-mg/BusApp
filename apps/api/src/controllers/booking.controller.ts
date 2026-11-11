import { Request, Response } from 'express'
import { z } from 'zod'
import QRCode from 'qrcode'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { HOLD_MINUTES, releaseExpiredHolds } from '../lib/seats'
import { PUBLIC_OPERATOR_FIELDS } from '../lib/visibility'
import { SaleError, validateTripForSale, lockAndCheckSeats, checkUserHoldLimit } from '../lib/sales'
import { generateTicketCode } from '../lib/ticketCode'
import { refundFor } from '../lib/refund'

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
          // One account can't sit on seats it never pays for (taken before the trip lock)
          await checkUserHoldLimit(tx, userId, seatNumbers.length, now)
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
// A passenger cancels with the Refund Policy tiers (100% / 50% / 0%, by hours before
// departure). The admin cancelling always refunds 100%. Money is only recorded here:
// the admin sends it back and marks it done (see recordRefund).

async function loadCancellable(req: AuthRequest) {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id as string },
    include: { payment: true, schedule: { select: { departureTime: true, bus: { select: { operatorId: true } } } } },
  })
  if (!booking) throw new SaleError(404, 'Booking not found')

  // Only owner or admin can cancel
  if (booking.userId !== req.userId && req.userRole !== 'ADMIN') throw new SaleError(403, 'Access denied')

  // Counter tickets were paid at the counter: only staff can void them
  if (booking.source === 'COUNTER') {
    throw new SaleError(403, 'This ticket was sold at the counter. Please ask the bus company to cancel it.')
  }
  if (booking.status === 'CANCELLED') throw new SaleError(400, 'Booking already cancelled')
  if (booking.status === 'COMPLETED') throw new SaleError(400, 'Cannot cancel a completed booking')
  if (booking.boardedAt) throw new SaleError(400, 'This passenger has already boarded, so the ticket cannot be cancelled')

  const byAdmin = req.userRole === 'ADMIN'
  if (!byAdmin && booking.schedule.departureTime.getTime() <= Date.now()) {
    throw new SaleError(400, 'This trip has already departed, so the ticket can no longer be cancelled')
  }
  return { booking, byAdmin }
}

const paidOnline = (b: { payment: { status: string } | null }) => b.payment?.status === 'SUCCESS'

// What would I get back if I cancel now? (shown before the passenger confirms)
export const getRefundPreview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { booking, byAdmin } = await loadCancellable(req)
    const paid = paidOnline(booking)
    const refund = paid ? refundFor(booking.totalPrice, booking.schedule.departureTime, new Date(), byAdmin) : null
    res.json({
      success: true,
      data: {
        paid,
        totalPrice: booking.totalPrice,
        percent: refund?.percent ?? null,
        refundAmount: refund?.refundAmount ?? null,
        keepAmount: refund?.keepAmount ?? null,
        hoursLeft: Math.max(0, Math.floor((booking.schedule.departureTime.getTime() - Date.now()) / 3_600_000)),
      },
    })
  } catch (error) {
    if (error instanceof SaleError) {
      res.status(error.status).json({ success: false, error: error.message })
      return
    }
    console.error('RefundPreview error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

export const cancelBooking = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const first = await loadCancellable(req)
    const id = first.booking.id

    const result = await prisma.$transaction(async (tx) => {
      // Same locks, same order, as payouts and refunds: the company's money first, then the trip
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'payout:' + first.booking.schedule.bus.operatorId}))`
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${first.booking.scheduleId}))`

      // Read again under the lock: the passenger may have boarded or paid a moment ago
      const booking = await tx.booking.findUnique({ where: { id }, include: { payment: true } })
      if (!booking || booking.status === 'CANCELLED' || booking.status === 'COMPLETED' || booking.boardedAt) {
        throw new SaleError(409, 'This booking can no longer be cancelled')
      }

      const now = new Date()
      const refund = paidOnline(booking)
        ? refundFor(booking.totalPrice, first.booking.schedule.departureTime, now, first.byAdmin)
        : null

      const done = await tx.booking.updateMany({
        where: { id, status: { in: ['PENDING', 'CONFIRMED'] }, boardedAt: null },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          refundPercent: refund?.percent ?? null,
          refundAmount: refund?.refundAmount ?? null,
        },
      })
      if (done.count === 0) throw new SaleError(409, 'This booking can no longer be cancelled')

      const updated = await tx.booking.findUnique({
        where: { id },
        include: { schedule: { include: { route: true } } },
      })
      return { updated, refund }
    })

    res.json({
      success: true,
      message: result.refund
        ? result.refund.refundAmount > 0
          ? `Booking cancelled. ETB ${result.refund.refundAmount} (${result.refund.percent}%) will be refunded to you.`
          : 'Booking cancelled. Under the Refund Policy no refund is due this close to departure.'
        : 'Booking cancelled',
      data: { booking: result.updated, refund: result.refund },
    })
  } catch (error) {
    if (error instanceof SaleError) {
      res.status(error.status).json({ success: false, error: error.message })
      return
    }
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