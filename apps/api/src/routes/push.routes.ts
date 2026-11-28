import { Router, IRouter } from 'express'
import { authenticate, type AuthRequest } from '../middleware/auth'
import { rateLimit, clientIp } from '../middleware/rateLimit'
import { getPublicKey, subscribe, unsubscribe } from '../controllers/push.controller'

const router: IRouter = Router()

const perAccount = (name: string, max: number) =>
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max,
    key: (req) => ((req as AuthRequest).userId ? `${name}:${(req as AuthRequest).userId}` : null),
    message: 'Too many requests. Please try again later.',
  })
const publicKeyPerIp = rateLimit({ windowMs: 60 * 1000, max: 120, key: (req) => `push-key:${clientIp(req)}` })

router.get('/public-key', publicKeyPerIp, getPublicKey)
router.post('/subscribe', authenticate, perAccount('push-sub', 30), subscribe)
router.delete('/subscribe', authenticate, perAccount('push-unsub', 30), unsubscribe)

export default router
