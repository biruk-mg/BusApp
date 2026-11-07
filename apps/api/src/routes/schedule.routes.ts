import { Router, IRouter } from 'express'
import { searchSchedules, getAllSchedules, getScheduleSeats, createSchedule, deleteSchedule, setScheduleStatus, getScheduleById } from '../controllers/schedule.controller'
import { authenticate } from '../middleware/auth'
import { requireManager } from '../middleware/staff'

const router: IRouter = Router()

router.get('/search', searchSchedules)
router.get('/:id/seats', getScheduleSeats)
router.get('/', getAllSchedules)
router.get('/:id', getScheduleById)
router.post('/', authenticate, requireManager, createSchedule)
router.patch('/:id/status', authenticate, requireManager, setScheduleStatus)
router.delete('/:id', authenticate, requireManager, deleteSchedule)

export default router