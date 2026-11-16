import { Router, IRouter } from 'express'
import {
  createBooking,
  getMyBookings,
  getBooking,
  cancelBooking,
  getRefundPreview,
  getAllBookings,
} from '../controllers/booking.controller'
import { rateBooking } from '../controllers/rating.controller'
import { getBookingTracking } from '../controllers/tracking.controller'
import { rateLimit } from '../middleware/rateLimit'
import { authenticate, authorizeAdmin, type AuthRequest } from '../middleware/auth'

const router: IRouter = Router()

// A passenger's map asks for the bus position about every 10 seconds. 30 a minute is plenty and
// stops a runaway page or script from hammering the server.
const passengerPolls = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  key: (req) => ((req as AuthRequest).userId ? `track:${(req as AuthRequest).userId}` : null),
})

// All booking routes require authentication
router.post('/', authenticate, createBooking)
router.get('/my', authenticate, getMyBookings)
router.get('/:id', authenticate, getBooking)
router.get('/:id/refund-preview', authenticate, getRefundPreview)
router.patch('/:id/cancel', authenticate, cancelBooking)
router.put('/:id/rating', authenticate, rateBooking)
router.get('/:id/tracking', authenticate, passengerPolls, getBookingTracking)

// Admin only
router.get('/', authenticate, authorizeAdmin, getAllBookings)

export default router