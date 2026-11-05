import { Request, Response } from 'express'
import axios from 'axios'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { PAYMENT_WINDOW_MINUTES, activeBookingFilter, releaseExpiredHolds } from '../lib/seats'

const CHAPA_BASE_URL = 'https://api.chapa.co/v1'

type PaymentOutcome =
  | { status: 'SUCCESS'; bookingStatus: string; refundNeeded?: boolean }
  | { status: 'PENDING' }
  | { status: 'FAILED'; reason?: string }

// tx_ref format: ETHIOBUS-<bookingId>-<timestamp>
// The booking id is inside the reference, so an older attempt can still be
// matched to its booking even if the passenger started payment twice.
function bookingIdFromTxRef(txRef: string): string | undefined {
  const parts = txRef.split('-')
  return parts.length === 3 && parts[0] === 'ETHIOBUS' ? parts[1] : undefined
}

// ─── Core: check a payment with Chapa and update our records ──
// Safe to call many times (Chapa callback, return page, retries):
//  - never downgrades a payment that already succeeded
//  - only confirms the booking when Chapa says success AND the amount is right
//  - if the seat hold ran out while the passenger was paying, the booking is
//    restored when the seats are still free; otherwise it is flagged for refund
async function confirmPayment(txRef: string): Promise<PaymentOutcome | null> {
  let payment = await prisma.payment.findFirst({ where: { chapaRef: txRef } })
  if (!payment) {
    const bookingId = bookingIdFromTxRef(txRef)
    if (bookingId) payment = await prisma.payment.findUnique({ where: { bookingId } })
  }
  if (!payment) return null

  if (payment.status === 'SUCCESS') {
    const booking = await prisma.booking.findUnique({ where: { id: payment.bookingId } })
    return { status: 'SUCCESS', bookingStatus: booking?.status ?? 'UNKNOWN' }
  }

  const chapaRes = await axios.get(
    `${CHAPA_BASE_URL}/transaction/verify/${encodeURIComponent(txRef)}`,
    { headers: { Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}` } }
  )
  const chapaData = chapaRes.data.data
  const chapaStatus = String(chapaData?.status ?? '').toLowerCase()

  if (chapaStatus === 'pending') return { status: 'PENDING' }

  if (chapaStatus !== 'success') {
    // Only the latest attempt may mark the payment as failed
    if (payment.chapaRef === txRef) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } })
    }
    return { status: 'FAILED' }
  }

  const paidEnough = Number(chapaData.amount) + 0.001 >= payment.amount
  const currencyOk = !chapaData.currency || String(chapaData.currency).toUpperCase() === 'ETB'
  if (!paidEnough || !currencyOk) {
    console.error(
      `Payment mismatch for ${txRef}: expected ${payment.amount} ETB, Chapa reported ${chapaData.amount} ${chapaData.currency}`
    )
    return { status: 'FAILED', reason: 'Amount mismatch' }
  }

  const result = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: payment!.bookingId } })
    if (!booking) throw new Error('Booking missing for payment')

    await tx.payment.update({
      where: { id: payment!.id },
      data: { status: 'SUCCESS', chapaRef: txRef },
    })

    if (booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') {
      return { bookingStatus: booking.status, refundNeeded: false }
    }

    // PENDING (normal case) or CANCELLED (hold ran out while paying)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${booking.scheduleId}))`

    if (booking.status === 'CANCELLED') {
      const others = await tx.booking.findMany({
        where: { scheduleId: booking.scheduleId, id: { not: booking.id }, ...activeBookingFilter() },
        select: { seatNumbers: true },
      })
      const taken = new Set(others.flatMap((b) => b.seatNumbers))
      if (booking.seatNumbers.some((seat) => taken.has(seat))) {
        return { bookingStatus: 'CANCELLED', refundNeeded: true }
      }
    }

    await tx.booking.update({
      where: { id: booking.id },
      data: { status: 'CONFIRMED', expiresAt: null },
    })
    return { bookingStatus: 'CONFIRMED', refundNeeded: false }
  })

  if (result.refundNeeded) {
    console.error(`REFUND NEEDED: booking ${payment.bookingId} was paid (${txRef}) but its seats were already taken`)
  }
  return { status: 'SUCCESS', ...result }
}

// ─── Initialize Payment ──────────────────────────────────
export const initializePayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.body
    const userId = req.userId!

    if (!bookingId) {
      res.status(400).json({ success: false, error: 'bookingId is required' })
      return
    }

    // If the hold has run out, free it first so we answer correctly
    await releaseExpiredHolds(prisma, { id: bookingId })

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: true,
        schedule: { include: { route: true } },
      },
    })

    if (!booking) {
      res.status(404).json({ success: false, error: 'Booking not found' })
      return
    }

    if (booking.userId !== userId) {
      res.status(403).json({ success: false, error: 'Access denied' })
      return
    }

    if (booking.status === 'CANCELLED') {
      res.status(400).json({
        success: false,
        error: 'This booking expired or was cancelled. Please choose your seats again.',
      })
      return
    }

    const existingPayment = await prisma.payment.findUnique({ where: { bookingId } })

    if (existingPayment?.status === 'SUCCESS') {
      res.status(400).json({ success: false, error: 'Booking already paid' })
      return
    }

    const txRef = `ETHIOBUS-${bookingId}-${Date.now()}`

    const chapaRes = await axios.post(
      `${CHAPA_BASE_URL}/transaction/initialize`,
      {
        amount: booking.totalPrice,
        currency: 'ETB',
        email: booking.user.email || `user${booking.user.id.slice(-6)}@ethiobus.com`,
        first_name: booking.user.name.split(' ')[0],
        last_name: booking.user.name.split(' ')[1] || booking.user.name,
        phone_number: booking.user.phone,
        tx_ref: txRef,
        callback_url: `${process.env.API_URL}/api/v1/payments/verify`,
        return_url: `${process.env.FRONTEND_URL}/bookings/${bookingId}?payment=success`,
        customization: {
          title: 'EthioBus',
          description: `${booking.schedule.route.fromCity} to ${booking.schedule.route.toCity}`,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )

    // The passenger chooses the payment method on Chapa's page, so this is
    // only a placeholder until we record the real method.
    await prisma.payment.upsert({
      where: { bookingId },
      update: { amount: booking.totalPrice, method: 'TELEBIRR', chapaRef: txRef, status: 'PENDING' },
      create: { bookingId, amount: booking.totalPrice, method: 'TELEBIRR', chapaRef: txRef, status: 'PENDING' },
    })

    // Keep the seats reserved while the passenger is on Chapa's page
    if (booking.status === 'PENDING') {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000) },
      })
    }

    res.json({
      success: true,
      data: {
        checkoutUrl: chapaRes.data.data.checkout_url,
        txRef,
      },
    })
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown } }
    console.error('InitializePayment error response:', JSON.stringify(err.response?.data, null, 2))
    res.status(500).json({ success: false, error: 'Payment initialization failed' })
  }
}

// ─── Chapa callback (called by Chapa, no login) ──────────
export const verifyPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.query.trx_ref ?? req.query.tx_ref
    const txRef = Array.isArray(raw) ? String(raw[0]) : (raw as string | undefined)

    if (!txRef) {
      res.status(400).json({ success: false, error: 'Transaction reference required' })
      return
    }

    const result = await confirmPayment(txRef)
    if (!result) {
      res.status(404).json({ success: false, error: 'Payment not found' })
      return
    }

    res.json({ success: true, data: result })
  } catch (error) {
    console.error('VerifyPayment error:', error)
    res.status(500).json({ success: false, error: 'Payment verification failed' })
  }
}

// ─── Check my booking's payment (used by the ticket page) ─
// If Chapa's callback was late or missed, this still confirms a paid booking.
export const verifyBookingPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const bookingId = req.params.bookingId as string
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payment: true },
    })

    if (!booking) {
      res.status(404).json({ success: false, error: 'Booking not found' })
      return
    }
    if (booking.userId !== req.userId && req.userRole !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Access denied' })
      return
    }
    if (!booking.payment?.chapaRef) {
      res.json({ success: true, data: { status: 'NO_PAYMENT' } })
      return
    }

    const result = await confirmPayment(booking.payment.chapaRef)
    res.json({ success: true, data: result ?? { status: 'NO_PAYMENT' } })
  } catch (error) {
    console.error('VerifyBookingPayment error:', error)
    res.status(500).json({ success: false, error: 'Payment verification failed' })
  }
}

// ─── Get Payment Status ──────────────────────────────────
export const getPaymentStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const bookingId = req.params.bookingId as string

    const payment = await prisma.payment.findUnique({
      where: { bookingId },
    })

    if (!payment) {
      res.json({ success: true, data: { payment: null } })
      return
    }

    res.json({ success: true, data: { payment } })
  } catch (error) {
    console.error('GetPaymentStatus error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
