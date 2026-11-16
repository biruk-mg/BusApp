import { Router, IRouter } from 'express'
import {
  listCheckinTrips,
  getTripPassengers,
  boardPassenger,
  unboardPassenger,
  lookupTicket,
} from '../controllers/checkin.controller'
import { startTrip, endTrip, sendLocation } from '../controllers/tracking.controller'
import { authenticate, type AuthRequest } from '../middleware/auth'
import { requireStaff } from '../middleware/staff'
import { rateLimit } from '../middleware/rateLimit'

const router: IRouter = Router()

// Ticket checkers and managers of a company. The master admin is left out on purpose:
// every tick must be traceable to a staff member of the company.
const checkers = [authenticate, requireStaff(['CHECKER', 'MANAGER'], { allowAdmin: false })]

router.get('/trips', ...checkers, listCheckinTrips)
router.get('/trips/:id/passengers', ...checkers, getTripPassengers)
router.post('/bookings/:id/board', ...checkers, boardPassenger)
router.post('/bookings/:id/unboard', ...checkers, unboardPassenger)
router.get('/lookup/:code', ...checkers, lookupTicket)

// Live tracking. The phone sends a position about every 20 seconds; 30 a minute leaves room for
// a phone that sends the ones it saved while it had no signal.
const locationPerStaff = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  key: (req) => ((req as AuthRequest).userId ? `location:${(req as AuthRequest).userId}` : null),
})
router.post('/trips/:id/start', ...checkers, startTrip)
router.post('/trips/:id/end', ...checkers, endTrip)
router.post('/trips/:id/location', ...checkers, locationPerStaff, sendLocation)

export default router
