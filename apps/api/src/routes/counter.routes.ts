import { Router, IRouter } from 'express'
import {
  listCounterTrips,
  createCounterSale,
  listCounterSales,
  voidCounterSale,
  counterReport,
} from '../controllers/counter.controller'
import { authenticate } from '../middleware/auth'
import { requireStaff } from '../middleware/staff'

const router: IRouter = Router()

// Sellers and managers of a company sell and void. The master admin is left out
// on purpose: every sale must be traceable to a staff member of the company.
const sellers = [authenticate, requireStaff(['SELLER', 'MANAGER'], { allowAdmin: false })]
const managers = [authenticate, requireStaff(['MANAGER'], { allowAdmin: false })]

router.get('/trips', ...sellers, listCounterTrips)
router.post('/sales', ...sellers, createCounterSale)
router.get('/sales', ...sellers, listCounterSales)
router.post('/sales/:id/void', ...sellers, voidCounterSale)
router.get('/report', ...managers, counterReport)

export default router
