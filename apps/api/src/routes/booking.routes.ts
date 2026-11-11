import { Router, IRouter } from 'express'
import {
  createBooking,
  getMyBookings,
  getBooking,
  cancelBooking,
  getRefundPreview,
  getAllBookings,
} from '../controllers/booking.controller'
import { authenticate, authorizeAdmin } from '../middleware/auth'

const router: IRouter = Router()

// All booking routes require authentication
router.post('/', authenticate, createBooking)
router.get('/my', authenticate, getMyBookings)
router.get('/:id', authenticate, getBooking)
router.get('/:id/refund-preview', authenticate, getRefundPreview)
router.patch('/:id/cancel', authenticate, cancelBooking)

// Admin only
router.get('/', authenticate, authorizeAdmin, getAllBookings)

export default router