import { Router, IRouter } from 'express'
import {
  initializePayment,
  verifyPayment,
  getPaymentStatus,
} from '../controllers/payment.controller'
import { authenticate } from '../middleware/auth'

const router: IRouter = Router()

router.post('/initialize', authenticate, initializePayment)
router.get('/verify', verifyPayment)
router.get('/status/:bookingId', authenticate, getPaymentStatus)

export default router