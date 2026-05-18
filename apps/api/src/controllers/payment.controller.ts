import { Request, Response } from 'express'
import axios from 'axios'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

const CHAPA_BASE_URL = 'https://api.chapa.co/v1'

// ─── Initialize Payment ──────────────────────────────────
export const initializePayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.body
    const userId = req.userId!

    if (!bookingId) {
      res.status(400).json({ success: false, error: 'bookingId is required' })
      return
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: true,
        schedule: { include: { route: true } }
      }
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
      res.status(400).json({ success: false, error: 'Booking is cancelled' })
      return
    }

    const existingPayment = await prisma.payment.findUnique({
      where: { bookingId }
    })

    if (existingPayment?.status === 'SUCCESS') {
      res.status(400).json({ success: false, error: 'Booking already paid' })
      return
    }

    const txRef = `ETHIOBUS-${bookingId}-${Date.now()}`
    const chapaKey = process.env.CHAPA_SECRET_KEY

    console.log('🔑 Chapa key:', chapaKey ? chapaKey.slice(0, 20) + '...' : 'UNDEFINED')

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
}
      },
      {
        headers: {
          Authorization: `Bearer ${chapaKey}`,
          'Content-Type': 'application/json',
        }
      }
    )

    await prisma.payment.upsert({
      where: { bookingId },
      update: {
        amount: booking.totalPrice,
        method: 'TELEBIRR',
        chapaRef: txRef,
        status: 'PENDING',
      },
      create: {
        bookingId,
        amount: booking.totalPrice,
        method: 'TELEBIRR',
        chapaRef: txRef,
        status: 'PENDING',
      }
    })

    res.json({
      success: true,
      data: {
        checkoutUrl: chapaRes.data.data.checkout_url,
        txRef,
      }
    })
 } catch (error: unknown) {
    const err = error as { response?: { data?: unknown } }
    console.error('InitializePayment error response:', JSON.stringify(err.response?.data, null, 2))
    res.status(500).json({ success: false, error: 'Payment initialization failed' })
  }
}

// ─── Verify Payment ──────────────────────────────────────
export const verifyPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawRef = req.query.trx_ref
    const txRefStr = Array.isArray(rawRef) ? rawRef[0] : rawRef as string

    if (!txRefStr) {
      res.status(400).json({ success: false, error: 'Transaction reference required' })
      return
    }

    const chapaRes = await axios.get(
      `${CHAPA_BASE_URL}/transaction/verify/${txRefStr}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`,
        }
      }
    )

    const chapaData = chapaRes.data.data
    const isSuccess = chapaData.status === 'success'

    const payment = await prisma.payment.findFirst({
      where: { chapaRef: txRefStr }
    })

    if (!payment) {
      res.status(404).json({ success: false, error: 'Payment not found' })
      return
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: isSuccess ? 'SUCCESS' : 'FAILED' }
    })

    if (isSuccess) {
      await prisma.booking.update({
        where: { id: payment.bookingId },
        data: { status: 'CONFIRMED' }
      })
    }

    res.json({
      success: true,
      data: {
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        amount: chapaData.amount,
        currency: chapaData.currency,
      }
    })
  } catch (error) {
    console.error('VerifyPayment error:', error)
    res.status(500).json({ success: false, error: 'Payment verification failed' })
  }
}

// ─── Get Payment Status ──────────────────────────────────
export const getPaymentStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const bookingId = req.params.bookingId as string

    const payment = await prisma.payment.findUnique({
      where: { bookingId }
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