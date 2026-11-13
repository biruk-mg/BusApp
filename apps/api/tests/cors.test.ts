import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import http from 'http'
import type { AddressInfo } from 'net'
import express from 'express'
import cors from 'cors'
import { corsGuard, parseOrigins } from '../src/lib/cors'

// The real guard and the real cors middleware, in a tiny app, over real HTTP.
const logged: string[] = []
let server: http.Server
let base = ''
let reached = 0

beforeAll(async () => {
  const allowed = parseOrigins('https://mugobus.vercel.app/, https://mugobus.com', ['http://localhost:3000'])
  const app = express()
  app.use(corsGuard(allowed, (m) => logged.push(m)))
  app.use(cors({ origin: allowed, credentials: true, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'] }))
  app.use(express.json())
  app.post('/api/do-something', (_req, res) => { reached++; res.json({ success: true }) })
  app.get('/api/hello', (_req, res) => res.json({ success: true }))
  server = http.createServer(app)
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

describe('parseOrigins', () => {
  it('splits, trims, drops trailing slashes and empty parts', () => {
    expect(parseOrigins(' https://a.com/ ,https://b.com,, ', ['http://localhost:3000'])).toEqual(['https://a.com', 'https://b.com', 'http://localhost:3000'])
    expect(parseOrigins(undefined)).toEqual([])
  })
})

describe('CORS guard', () => {
  it('lets the website addresses from FRONTEND_URL through, with the CORS headers', async () => {
    const res = await fetch(`${base}/api/hello`, { headers: { Origin: 'https://mugobus.vercel.app' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://mugobus.vercel.app')
    expect((await fetch(`${base}/api/hello`, { headers: { Origin: 'http://localhost:3000' } })).status).toBe(200)
  })

  it('lets calls with no Origin through (mobile app, curl, other servers)', async () => {
    expect((await fetch(`${base}/api/hello`)).status).toBe(200)
  })

  it('turns away an unknown website address with a clear message, before the route runs', async () => {
    const before = reached
    const res = await fetch(`${base}/api/do-something`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { success: boolean; error: string }
    expect(body.success).toBe(false)
    expect(body.error).toContain('https://evil.example')
    expect(body.error).toContain('FRONTEND_URL')
    expect(reached).toBe(before) // the action never happened
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('turns away the browser\'s preflight check from an unknown address too', async () => {
    const res = await fetch(`${base}/api/do-something`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://preview-123.vercel.app', 'Access-Control-Request-Method': 'POST' },
    })
    expect(res.status).toBe(403)
  })

  it('writes one clear line to the server log per unknown address, not one per call', async () => {
    logged.length = 0
    for (let i = 0; i < 3; i++) await fetch(`${base}/api/hello`, { headers: { Origin: 'https://another-unknown.example' } })
    await fetch(`${base}/api/hello`, { headers: { Origin: 'https://yet-another.example' } })
    expect(logged).toHaveLength(2)
    expect(logged[0]).toContain('https://another-unknown.example')
    expect(logged[0]).toContain('FRONTEND_URL')
  })
})
