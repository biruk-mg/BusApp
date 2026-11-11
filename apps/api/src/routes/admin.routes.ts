import { Router, IRouter } from 'express'
import {
  listOperators,
  getOperator,
  createOperator,
  updateOperator,
  suspendOperator,
  reactivateOperator,
  resetCompanyStaffPassword,
  getAttention,
  getDashboard,
} from '../controllers/admin.controller'
import {
  listBalances,
  getCompanyEarnings,
  createPayout,
  voidPayout,
  recordRefund,
} from '../controllers/payout.controller'
import { listBanners, createBanner, updateBanner, deleteBanner } from '../controllers/banner.controller'
import { authenticate } from '../middleware/auth'
import { requireAdmin } from '../middleware/admin'

const router: IRouter = Router()

// Platform admin only (re-checked in the database on every request)
const admin = [authenticate, requireAdmin]

router.get('/dashboard', ...admin, getDashboard)
router.get('/attention', ...admin, getAttention)
router.get('/operators', ...admin, listOperators)
router.post('/operators', ...admin, createOperator)
router.get('/operators/:id', ...admin, getOperator)
router.patch('/operators/:id', ...admin, updateOperator)
router.post('/operators/:id/suspend', ...admin, suspendOperator)
router.post('/operators/:id/reactivate', ...admin, reactivateOperator)
router.post('/operators/:id/staff/:staffId/password', ...admin, resetCompanyStaffPassword)

// Money: what each company is owed, payouts, and refunds of online payments
router.get('/payouts', ...admin, listBalances)
router.get('/operators/:id/earnings', ...admin, getCompanyEarnings)
router.post('/operators/:id/payouts', ...admin, createPayout)
router.post('/payouts/:id/void', ...admin, voidPayout)
router.post('/bookings/:id/refund', ...admin, recordRefund)

// Offers shown on the home page
router.get('/banners', ...admin, listBanners)
router.post('/banners', ...admin, createBanner)
router.patch('/banners/:id', ...admin, updateBanner)
router.delete('/banners/:id', ...admin, deleteBanner)

export default router
