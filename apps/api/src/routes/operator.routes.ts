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
import { authenticate } from '../middleware/auth'

const router: IRouter = Router()

const authorizeOperator = (req: any, res: any, next: any) => {
  if (req.userRole !== 'OPERATOR' && req.userRole !== 'ADMIN') {
    res.status(403).json({ success: false, error: 'Operator access required' })
    return
  }
  next()
}

router.get('/profile', authenticate, authorizeOperator, getOperatorProfile)
router.get('/buses', authenticate, authorizeOperator, getOperatorBuses)
router.post('/buses', authenticate, authorizeOperator, createBus)
router.get('/bookings', authenticate, authorizeOperator, getOperatorBookings)
router.get('/stats', authenticate, authorizeOperator, getOperatorStats)
router.get('/analytics', authenticate, authorizeOperator, getRevenueAnalytics)
router.get('/availability', authenticate, authorizeOperator, getScheduleAvailability)
router.get('/buses/all', authenticate, authorizeOperator, getOperatorBuses)
router.get('/pickups', authenticate, authorizeOperator, listMyPickupPoints)
router.post('/pickups', authenticate, authorizeOperator, createPickupPoint)
router.put('/pickups/:id', authenticate, authorizeOperator, updatePickupPoint)
router.delete('/pickups/:id', authenticate, authorizeOperator, deletePickupPoint)

export default router