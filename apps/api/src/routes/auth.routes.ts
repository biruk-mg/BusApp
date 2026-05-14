import { Router, IRouter, Request, Response, NextFunction } from 'express'
import { register, login, getMe, getAllUsers } from '../controllers/auth.controller'
import { authenticate, authorizeAdmin } from '../middleware/auth'

const router: IRouter = Router()

// Debug middleware
router.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`🔥 Auth route hit: ${req.method} ${req.path}`)
  console.log('Body:', req.body)
  next()
})

// Public routes
router.post('/register', register)
router.post('/login', login)

// Protected routes
router.get('/me', authenticate, getMe)

// Add this line at the bottom
router.get('/users', authenticate, authorizeAdmin, getAllUsers)

export default router