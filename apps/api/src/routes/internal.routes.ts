import { Router, IRouter } from 'express'
import { rateLimit, clientIp } from '../middleware/rateLimit'
import { alertsTick } from '../controllers/push.controller'

const router: IRouter = Router()

// An outside clock calls this about once a minute. 20 a minute leaves room for a retry, and
// stops anyone guessing the secret quickly.
const tickPerIp = rateLimit({ windowMs: 60 * 1000, max: 20, key: (req) => `alerts-tick:${clientIp(req)}` })
router.post('/alerts/tick', tickPerIp, alertsTick)

export default router
