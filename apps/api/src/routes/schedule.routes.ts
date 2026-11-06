import { Router, IRouter } from 'express'
import { searchSchedules, getAllSchedules, getScheduleSeats, createSchedule, deleteSchedule, setScheduleStatus, getScheduleById } from '../controllers/schedule.controller'
import { authenticate, authorizeOperatorOrAdmin } from '../middleware/auth'

const router: IRouter = Router()

router.get('/search', searchSchedules)
router.get('/:id/seats', getScheduleSeats)
router.get('/', getAllSchedules)
router.get('/:id', getScheduleById)
router.post('/', authenticate, authorizeOperatorOrAdmin, createSchedule)
router.patch('/:id/status', authenticate, authorizeOperatorOrAdmin, setScheduleStatus)
router.delete('/:id', authenticate, authorizeOperatorOrAdmin, deleteSchedule)

export default router