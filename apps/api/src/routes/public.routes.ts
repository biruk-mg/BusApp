import { Router, IRouter } from 'express'
import { getHome } from '../controllers/public.controller'

const router: IRouter = Router()

// No login needed: this is what the home page shows to everyone
router.get('/home', getHome)

export default router
