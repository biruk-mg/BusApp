import { Router, IRouter } from 'express'
import { getPublicTicket } from '../controllers/ticket.controller'

const router: IRouter = Router()

// Public: no login. The code itself is the secret.
router.get('/:code', getPublicTicket)

export default router
