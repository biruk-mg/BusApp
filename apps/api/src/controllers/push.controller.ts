import { Response } from 'express'
import { createHash, timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { getChannel, publicVapidKey } from '../lib/pushChannel'
import { runDepartSoon } from '../lib/arrivalAlertRunner'

/**
 * Notifications: a phone (browser) tells the server it agrees to get them, and the outside clock
 * that triggers the "30 minutes before departure" reminder. A subscription always belongs to the
 * logged-in account that registered it.
 */

const MAX_SUBSCRIPTIONS_PER_USER = 5

const fail = (res: Response, status: number, error: string) => res.status(status).json({ success: false, error })
const serverError = (res: Response, name: string, error: unknown) => {
  console.error(`${name} error:`, error)
  res.status(500).json({ success: false, error: 'Internal server error' })
}

const subscribeBody = z.object({
  // Push services are always https. Anything else is not a real subscription.
  endpoint: z.string().url().startsWith('https://').max(2048),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(5).max(100) }),
  lang: z.enum(['en', 'am', 'om']).default('en'),
})

const unsubscribeBody = z.object({ endpoint: z.string().max(2048) })

/** GET /push/public-key  (the website needs it to ask the browser for a subscription) */
export const getPublicKey = (_req: AuthRequest, res: Response): void => {
  // Short cache: every tracking page asks, and phones share addresses behind one mobile network
  res.setHeader('Cache-Control', 'public, max-age=300')
  const key = getChannel() ? publicVapidKey() : null
  res.json({ success: true, data: { enabled: !!key, publicKey: key } })
}

/** POST /push/subscribe */
export const subscribe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = subscribeBody.safeParse(req.body)
    if (!parsed.success) return void fail(res, 400, 'Invalid subscription')
    const { endpoint, keys, lang } = parsed.data
    const userId = req.userId!

    // The same browser is one row. If it was registered by another account (a shared phone),
    // it now belongs to the account that is logged in here.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, lang },
      update: { userId, p256dh: keys.p256dh, auth: keys.auth, lang },
    })

    // Keep the newest few; a person does not need more than a handful of devices
    const all = await prisma.pushSubscription.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { id: true, endpoint: true } })
    const extra = all.filter((s, i) => i >= MAX_SUBSCRIPTIONS_PER_USER && s.endpoint !== endpoint).map((s) => s.id)
    if (extra.length > 0) await prisma.pushSubscription.deleteMany({ where: { id: { in: extra } } })

    res.json({ success: true, data: { subscribed: true } })
  } catch (error) {
    serverError(res, 'PushSubscribe', error)
  }
}

/** DELETE /push/subscribe  (only your own; someone else's endpoint looks the same as one that does not exist) */
export const unsubscribe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = unsubscribeBody.safeParse(req.body)
    if (!parsed.success) return void fail(res, 400, 'Invalid request')
    await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, userId: req.userId! } })
    res.json({ success: true, data: { subscribed: false } })
  } catch (error) {
    serverError(res, 'PushUnsubscribe', error)
  }
}

// Compare secrets without leaking, through timing, how much of a guess was right
const sameSecret = (given: string, expected: string) =>
  timingSafeEqual(createHash('sha256').update(given).digest(), createHash('sha256').update(expected).digest())

/**
 * POST /internal/alerts/tick  (called about once a minute by an outside clock)
 * The API sleeps on a free plan, so it cannot run a clock of its own: a free cron service, or a
 * Render cron job, calls this with the header  x-cron-secret: <ALERTS_CRON_SECRET>.
 * Without that setting the route does not exist.
 */
export const alertsTick = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const secret = process.env.ALERTS_CRON_SECRET
    if (!secret) return void fail(res, 404, 'Not found')
    const given = req.headers['x-cron-secret']
    if (typeof given !== 'string' || !sameSecret(given, secret)) return void fail(res, 401, 'Not allowed')
    const result = await runDepartSoon()
    res.json({ success: true, data: result })
  } catch (error) {
    serverError(res, 'AlertsTick', error)
  }
}
