import { Router, IRouter } from 'express'
import {
  getOperatorProfile,
  getOperatorBuses,
  createBus,
  getOperatorBookings,
  getOperatorStats,
  getRevenueAnalytics,
  getScheduleAvailability, 
} from '../controllers/operator.controller'
import {
  listMyPickupPoints,
  createPickupPoint,
  updatePickupPoint,
  deletePickupPoint,
} from '../controllers/pickup.controller'
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  setTemplateActive,
  deleteTemplate,
} from '../controllers/template.controller'
import {
  listStaff,
  createStaff,
  updateStaff,
  resetStaffPassword,
} from '../controllers/staff.controller'
import { getMyEarnings } from '../controllers/payout.controller'
import { getMySales } from '../controllers/sales.controller'
import { getMyRatings } from '../controllers/rating.controller'
import { getMyStatement, downloadMyStatementCsv, downloadMySalesCsv } from '../controllers/statement.controller'
import { rateLimit } from '../middleware/rateLimit'
import { authenticate, type AuthRequest } from '../middleware/auth'
import { requireManager, requireStaff } from '../middleware/staff'

const router: IRouter = Router()

// Everything under /operator is for the company's managers (and the master admin)
// for now. Counter sales (sellers) and check-in (checkers) get their own routes later.
const managerOnly = [authenticate, requireManager]

// Statements read a lot of rows, so each account gets a limited number per hour
const statementsPerAccount = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  key: (req) => ((req as AuthRequest).userId ? `statements:${(req as AuthRequest).userId}` : null),
  message: 'Too many statement requests. Please try again later.',
})

router.get('/profile', ...managerOnly, getOperatorProfile)
router.get('/buses', ...managerOnly, getOperatorBuses)
router.post('/buses', ...managerOnly, createBus)
router.get('/bookings', ...managerOnly, getOperatorBookings)
router.get('/earnings', ...managerOnly, getMyEarnings)
router.get('/sales', ...managerOnly, getMySales)
router.get('/statement', ...managerOnly, statementsPerAccount, getMyStatement)
router.get('/statement.csv', ...managerOnly, statementsPerAccount, downloadMyStatementCsv)
router.get('/exports/sales.csv', ...managerOnly, statementsPerAccount, downloadMySalesCsv)
router.get('/ratings', ...managerOnly, getMyRatings)
router.get('/stats', ...managerOnly, getOperatorStats)
router.get('/analytics', ...managerOnly, getRevenueAnalytics)
router.get('/availability', ...managerOnly, getScheduleAvailability)
router.get('/buses/all', ...managerOnly, getOperatorBuses)
router.get('/pickups', ...managerOnly, listMyPickupPoints)
router.post('/pickups', ...managerOnly, createPickupPoint)
router.put('/pickups/:id', ...managerOnly, updatePickupPoint)
router.delete('/pickups/:id', ...managerOnly, deletePickupPoint)
router.get('/templates', ...managerOnly, listTemplates)
router.post('/templates', ...managerOnly, createTemplate)
router.put('/templates/:id', ...managerOnly, updateTemplate)
router.patch('/templates/:id/active', ...managerOnly, setTemplateActive)
router.delete('/templates/:id', ...managerOnly, deleteTemplate)


// Staff accounts: managers of a company only. The admin is not included because
// these endpoints work inside one company.
const staffManagers = [authenticate, requireStaff(['MANAGER'], { allowAdmin: false })]
router.get('/staff', ...staffManagers, listStaff)
router.post('/staff', ...staffManagers, createStaff)
router.patch('/staff/:id', ...staffManagers, updateStaff)
router.post('/staff/:id/password', ...staffManagers, resetStaffPassword)

export default router