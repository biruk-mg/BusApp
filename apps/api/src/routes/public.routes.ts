import { Router, IRouter } from 'express'
import { getHome, getBannerImage } from '../controllers/public.controller'

const router: IRouter = Router()

// No login needed: this is what the home page shows to everyone
router.get('/home', getHome)
router.get('/banners/:id/image', getBannerImage)

export default router
