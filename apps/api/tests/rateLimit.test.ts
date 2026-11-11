import { describe, it, expect } from 'vitest'
import type { Request, Response } from 'express'
import { rateLimit } from '../src/middleware/rateLimit'

/** A fake request and response, so no server is needed. */
function fakeReq(ip = '1.1.1.1', body: unknown = {}) {
  return { ip, body, socket: { remoteAddress: ip } } as unknown as Request
}
function fakeRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as any,
    setHeader(name: string, value: string) {
      this.headers[name] = value
    },
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return res
}

/** Sends one request through the limiter; true if it was let through. */
function hit(limiter: ReturnType<typeof rateLimit>, req: Request) {
  const res = fakeRes()
  let passed = false
  limiter(req, res as unknown as Response, () => {
    passed = true
  })
  return { passed, res }
}

describe('rateLimit', () => {
  it('lets requests through up to the limit, then answers 429 with Retry-After', () => {
    let t = 1_000_000
    const limiter = rateLimit({ windowMs: 60_000, max: 3, key: () => 'k', now: () => t })
    for (let i = 0; i < 3; i++) expect(hit(limiter, fakeReq()).passed).toBe(true)

    t += 10_000
    const blocked = hit(limiter, fakeReq())
    expect(blocked.passed).toBe(false)
    expect(blocked.res.statusCode).toBe(429)
    expect(blocked.res.body.success).toBe(false)
    expect(blocked.res.body.error).toMatch(/too many/i)
    expect(Number(blocked.res.headers['Retry-After'])).toBe(50) // 60s window, 10s used
  })

  it('starts counting again after the window ends', () => {
    let t = 0
    const limiter = rateLimit({ windowMs: 60_000, max: 1, key: () => 'k', now: () => t })
    expect(hit(limiter, fakeReq()).passed).toBe(true)
    expect(hit(limiter, fakeReq()).passed).toBe(false)
    t += 60_001
    expect(hit(limiter, fakeReq()).passed).toBe(true)
  })

  it('counts each key separately', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1, key: (req) => req.ip ?? null })
    expect(hit(limiter, fakeReq('1.1.1.1')).passed).toBe(true)
    expect(hit(limiter, fakeReq('1.1.1.1')).passed).toBe(false)
    expect(hit(limiter, fakeReq('2.2.2.2')).passed).toBe(true) // someone else is not affected
  })

  it('does not limit a request whose key is null', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1, key: () => null })
    for (let i = 0; i < 5; i++) expect(hit(limiter, fakeReq()).passed).toBe(true)
  })

  it('uses a custom message', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 0, key: () => 'k', message: 'Slow down please' })
    expect(hit(limiter, fakeReq()).res.body.error).toBe('Slow down please')
  })

  it('keeps separate limiters apart (login by IP + phone)', () => {
    const byPhone = rateLimit({
      windowMs: 60_000,
      max: 2,
      key: (req) => `${req.ip}|${(req.body as { phone?: string })?.phone ?? ''}`,
    })
    const a = fakeReq('1.1.1.1', { phone: '0911000001' })
    const b = fakeReq('1.1.1.1', { phone: '0911000002' })
    expect(hit(byPhone, a).passed).toBe(true)
    expect(hit(byPhone, a).passed).toBe(true)
    expect(hit(byPhone, a).passed).toBe(false) // third guess at the same account is stopped
    expect(hit(byPhone, b).passed).toBe(true) // a different account from the same connection is fine
  })
})
