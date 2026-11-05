import { Router, IRouter } from 'express'
import {
  initializePayment,
  verifyPayment,
  verifyBookingPayment,
  getPaymentStatus,
} from '../controllers/payment.controller'
import { authenticate } from '../middleware/auth'

const router: IRouter = Router()

router.post('/initialize', authenticate, initializePayment)
router.get('/verify', verifyPayment)
router.post('/verify-booking/:bookingId', authenticate, verifyBookingPayment)
router.get('/status/:bookingId', authenticate, getPaymentStatus)

export default router