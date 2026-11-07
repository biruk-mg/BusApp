import { Router, IRouter } from 'express'
import {
  listCheckinTrips,
  getTripPassengers,
  boardPassenger,
  unboardPassenger,
  lookupTicket,
} from '../controllers/checkin.controller'
import { authenticate } from '../middleware/auth'
import { requireStaff } from '../middleware/staff'

const router: IRouter = Router()

// Ticket checkers and managers of a company. The master admin is left out on purpose:
// every tick must be traceable to a staff member of the company.
const checkers = [authenticate, requireStaff(['CHECKER', 'MANAGER'], { allowAdmin: false })]

router.get('/trips', ...checkers, listCheckinTrips)
router.get('/trips/:id/passengers', ...checkers, getTripPassengers)
router.post('/bookings/:id/board', ...checkers, boardPassenger)
router.post('/bookings/:id/unboard', ...checkers, unboardPassenger)
router.get('/lookup/:code', ...checkers, lookupTicket)

export default router
