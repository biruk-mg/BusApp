import { Request, Response, NextFunction } from 'express'

/**
 * A small "too many tries" guard, kept in the server's memory (no extra package).
 *
 * It counts requests per key (for example per IP address) inside a time window and
 * answers 429 once the key goes over the limit. The counts live in this server
 * process, so they reset when the server restarts. That is fine for one API server
 * (Render): the goal is to stop password guessing and mass account creation, not
 * to be a perfect firewall.
 */
export interface RateLimitOptions {
  /** How long one counting window lasts. */
  windowMs: number
  /** How many requests a key may make inside one window. */
  max: number
  /** What to count by. Return null to leave this request unlimited. */
  key: (req: Request) => string | null
  message?: string
  /** For tests: a fake clock. */
  now?: () => number
}

const SWEEP_EVERY_MS = 60 * 1000

export function rateLimit(options: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>()
  const clock = options.now ?? Date.now
  let lastSweep = clock()

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = clock()

    // Forget finished windows now and then, so the table can't grow forever
    if (now - lastSweep > SWEEP_EVERY_MS) {
      for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key)
      lastSweep = now
    }

    const key = options.key(req)
    if (!key) {
      next()
      return
    }

    let entry = hits.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + options.windowMs }
      hits.set(key, entry)
    }
    entry.count++

    if (entry.count > options.max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))))
      res.status(429).json({
        success: false,
        error: options.message ?? 'Too many attempts. Please wait a few minutes and try again.',
      })
      return
    }
    next()
  }
}

/** The caller's IP address. Needs `app.set('trust proxy', 1)` behind Render, or everyone looks the same. */
export const clientIp = (req: Request): string => req.ip || req.socket.remoteAddress || 'unknown'
