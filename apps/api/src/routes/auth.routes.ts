import { Router, IRouter } from 'express'
import { register, login, getMe, getAllUsers } from '../controllers/auth.controller'
import { authenticate, authorizeAdmin } from '../middleware/auth'

const router: IRouter = Router()

// Public routes
router.post('/register', register)
router.post('/login', login)

// Protected routes
router.get('/me', authenticate, getMe)

// Add this line at the bottom
router.get('/users', authenticate, authorizeAdmin, getAllUsers)

export default router