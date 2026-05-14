import { Router, IRouter } from 'express'
import { searchSchedules, getAllSchedules, createSchedule, deleteSchedule } from '../controllers/schedule.controller'
import { authenticate, authorizeAdmin } from '../middleware/auth'

const router: IRouter = Router()

router.get('/search', searchSchedules)
router.get('/', getAllSchedules)
router.post('/', authenticate, authorizeAdmin, createSchedule)
router.delete('/:id', authenticate, authorizeAdmin, deleteSchedule)

export default router