import { Router, IRouter, Request } from 'express'
import { register, login, getMe, getAllUsers } from '../controllers/auth.controller'
import { authenticate, authorizeAdmin } from '../middleware/auth'
import { rateLimit, clientIp } from '../middleware/rateLimit'

const router: IRouter = Router()

// ─── Too-many-tries guards ──────────────────────────────────
// Many phones in Ethiopia share one IP address (mobile networks), so the limit per
// IP is generous; the tight limit is per IP + phone number, which is what stops
// someone guessing one account's password.
const MINUTE = 60 * 1000
const phoneOf = (req: Request): string => (typeof req.body?.phone === 'string' ? req.body.phone.trim() : '')

const loginPerIp = rateLimit({
  windowMs: 15 * MINUTE,
  max: 100,
  key: (req) => `login-ip:${clientIp(req)}`,
})
const loginPerPhone = rateLimit({
  windowMs: 15 * MINUTE,
  max: 10,
  key: (req) => `login:${clientIp(req)}|${phoneOf(req)}`,
  message: 'Too many login attempts for this number. Please wait 15 minutes and try again.',
})
const registerPerIp = rateLimit({
  windowMs: 60 * MINUTE,
  max: 30,
  key: (req) => `register-ip:${clientIp(req)}`,
  message: 'Too many accounts were created from this connection. Please try again later.',
})

// Public routes
router.post('/register', registerPerIp, register)
router.post('/login', loginPerIp, loginPerPhone, login)

// Protected routes
router.get('/me', authenticate, getMe)

// Add this line at the bottom
router.get('/users', authenticate, authorizeAdmin, getAllUsers)

export default router
