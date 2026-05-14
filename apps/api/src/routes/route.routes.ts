import { Router, IRouter } from 'express'
import { getAllRoutes, getRoute, createRoute, deleteRoute } from '../controllers/route.controller'
import { authenticate, authorizeAdmin } from '../middleware/auth'

const router: IRouter = Router()

router.get('/', getAllRoutes)
router.get('/:id', getRoute)
router.post('/', authenticate, authorizeAdmin, createRoute)
router.delete('/:id', authenticate, authorizeAdmin, deleteRoute)

export default router