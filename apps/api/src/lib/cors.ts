import type { NextFunction, Request, Response } from 'express'

/**
 * Which website addresses may call the API. They come from the FRONTEND_URL setting
 * (comma-separated, for example "https://mugobus.vercel.app,https://mugobus.com").
 */
export function parseOrigins(frontendUrl: string | undefined, extra: string[] = []): string[] {
  const list = (frontendUrl || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean)
  return [...list, ...extra]
}

/**
 * Turns away a call from a website address that is not allowed, BEFORE it reaches any
 * route, with a clear message in the answer and in the server log (once per address).
 * Calls with no Origin header (the mobile app, curl, other servers) pass.
 *
 * A browser still shows only "blocked by CORS" for such a call. The reason is in the
 * Network tab (the answer body) and in the Render logs.
 */
export function corsGuard(allowed: string[], log: (message: string) => void = console.warn) {
  const warned = new Set<string>()
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin
    if (!origin || allowed.includes(origin)) return next()
    if (!warned.has(origin)) {
      warned.add(origin)
      log(`CORS: blocked a call from ${origin}. If this is your own website, add it to FRONTEND_URL on Render (comma-separated), then redeploy.`)
    }
    res.status(403).json({
      success: false,
      error: `This website address (${origin}) is not allowed to use the API. Add it to FRONTEND_URL on the server.`,
    })
  }
}
