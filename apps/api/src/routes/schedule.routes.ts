import { Router, IRouter } from 'express'
import { searchSchedules, getAllSchedules, getScheduleSeats, createSchedule, deleteSchedule } from '../controllers/schedule.controller'
import { authenticate, authorizeOperatorOrAdmin } from '../middleware/auth'

const router: IRouter = Router()

router.get('/search', searchSchedules)
router.get('/:id/seats', getScheduleSeats)
router.get('/', getAllSchedules)
router.post('/', authenticate, authorizeOperatorOrAdmin, createSchedule)
router.delete('/:id', authenticate, authorizeOperatorOrAdmin, deleteSchedule)

export default router