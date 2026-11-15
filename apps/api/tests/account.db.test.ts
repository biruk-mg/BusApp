/**
 * Database tests for P1: the account page and passwords.
 *
 * Editing your own name and email, changing your password (which logs out your other
 * devices), the forced change after a temporary password, and the admin resetting a
 * passenger's password. All through the REAL routes, middleware and controllers over HTTP.
 *
 * Only run when TEST_DATABASE_URL is set; refuse to run against DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import dotenv from 'dotenv'
import http from 'http'
import type { AddressInfo } from 'net'
import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

dotenv.config({ path: '../../.env' })
const TEST_URL = process.env.TEST_DATABASE_URL
const NORMAL_URL = process.env.DATABASE_URL
if (TEST_URL && NORMAL_URL && TEST_URL === NORMAL_URL) {
  throw new Error('TEST_DATABASE_URL is the same as DATABASE_URL. Use a separate database or Neon branch.')
}
if (TEST_URL) process.env.DATABASE_URL = TEST_URL
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-only-for-tests'

type Prisma = typeof import('../src/lib/prisma').prisma
let prisma: Prisma
let server: http.Server
let baseUrl = ''
const tag = `TEST-${Date.now()}`
let phoneCounter = 0
const newPhone = () => `09${String((Date.now() % 1000000) * 100 + phoneCounter++).padStart(8, '0').slice(-8)}`
const created = { users: new Set<string>(), operators: new Set<string>() }

async function api(method: string, path: string, tok?: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any }
}

async function makeUser(label: string, role: 'CUSTOMER' | 'OPERATOR' | 'ADMIN' = 'CUSTOMER', password = 'start-pass', extra: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: { name: `${tag} ${label}`, phone: newPhone(), password: await bcrypt.hash(password, 4), role, ...extra },
  })
  created.users.add(user.id)
  return user
}

const login = async (phone: string, password: string) => api('POST', '/api/v1/auth/login', undefined, { phone, password })
/** A real login: the token the web app would hold */
const loginToken = async (user: { phone: string }, password = 'start-pass') => {
  const res = await login(user.phone, password)
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return res.body.data.token as string
}

describe.skipIf(!TEST_URL)('account page and passwords (P1, database, real routes)', () => {
  let operator: any
  let manager: any
  let admin: any
  let tokAdmin: string

  beforeAll(async () => {
    ;({ prisma } = await import('../src/lib/prisma'))
    const app = express()
    app.use(express.json())
    app.use('/api/v1/auth', (await import('../src/routes/auth.routes')).default)
    app.use('/api/v1/admin', (await import('../src/routes/admin.routes')).default)
    app.use('/api/v1/operator', (await import('../src/routes/operator.routes')).default)
    app.use('/api/v1/bookings', (await import('../src/routes/booking.routes')).default)
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    operator = await prisma.operator.create({ data: { companyName: `${tag} Co`, licenseNo: `${tag}-L`, phone: '0900000000' } })
    created.operators.add(operator.id)
    manager = await makeUser('manager', 'OPERATOR')
    await prisma.operatorStaff.create({ data: { userId: manager.id, operatorId: operator.id, role: 'MANAGER' } })
    admin = await makeUser('admin', 'ADMIN')
    tokAdmin = await loginToken(admin)
  })

  afterAll(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
    if (prisma) {
      const users = await prisma.user.findMany({ where: { name: { startsWith: tag } }, select: { id: true } })
      await prisma.operatorStaff.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } })
      await prisma.operator.deleteMany({ where: { id: { in: [...created.operators] } } })
      await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
      await prisma.$disconnect()
    }
  })

  // ─── My profile ─────────────────────────────────────────
  describe('my profile', () => {
    it('shows my account, never the password', async () => {
      const u = await makeUser('me-read')
      const res = await api('GET', '/api/v1/auth/me', await loginToken(u))
      expect(res.status).toBe(200)
      expect(res.body.data.user).toMatchObject({ id: u.id, name: u.name, phone: u.phone, role: 'CUSTOMER', mustChangePassword: false })
      expect(JSON.stringify(res.body)).not.toContain('"password"')
      expect(JSON.stringify(res.body)).not.toContain('tokenVersion')
    })

    it('lets me change my name and email, tidying the email', async () => {
      const u = await makeUser('edit')
      const tok = await loginToken(u)
      const res = await api('PATCH', '/api/v1/auth/me', tok, { name: '  New Name  ', email: ` ${tag}.Edit@Example.COM ` })
      expect(res.status, JSON.stringify(res.body)).toBe(200)
      expect(res.body.data.user).toMatchObject({ name: 'New Name', email: `${tag}.edit@example.com`.toLowerCase() })
      expect(JSON.stringify(res.body)).not.toContain('"password"')
      const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } })
      expect(row.name).toBe('New Name')
      expect(row.email).toBe(`${tag}.edit@example.com`.toLowerCase())

      // Clearing the email works too
      const cleared = await api('PATCH', '/api/v1/auth/me', tok, { name: 'New Name', email: '' })
      expect(cleared.status).toBe(200)
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).email).toBeNull()
    })

    it('can not change the phone, the role or the login flags, whatever is sent', async () => {
      const u = await makeUser('sneaky')
      const tok = await loginToken(u)
      const res = await api('PATCH', '/api/v1/auth/me', tok, {
        name: 'Still Me', phone: '0911111111', role: 'ADMIN', password: 'hacked', mustChangePassword: true, tokenVersion: 99,
      })
      expect(res.status).toBe(200)
      const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } })
      expect(row).toMatchObject({ phone: u.phone, role: 'CUSTOMER', mustChangePassword: false, tokenVersion: 0 })
      expect(await bcrypt.compare('start-pass', row.password)).toBe(true)
      // and still not an admin
      expect((await api('GET', '/api/v1/auth/users', tok)).status).toBe(403)
    })

    it("refuses an email that another account already uses (in any letter case), but keeps my own", async () => {
      const a = await makeUser('mail-a')
      const b = await makeUser('mail-b')
      const tokA = await loginToken(a)
      const tokB = await loginToken(b)
      const email = `${tag}.shared@example.com`.toLowerCase()
      expect((await api('PATCH', '/api/v1/auth/me', tokA, { name: 'A Person', email })).status).toBe(200)
      expect((await api('PATCH', '/api/v1/auth/me', tokB, { name: 'B Person', email: email.toUpperCase() })).status).toBe(409)
      // saving my own email again is not a clash
      expect((await api('PATCH', '/api/v1/auth/me', tokA, { name: 'A Person Two', email })).status).toBe(200)
    })

    it('also refuses an email that an older account saved with different capital letters', async () => {
      const old = await makeUser('mail-legacy', 'CUSTOMER', 'start-pass', { email: `${tag}.Legacy@Example.com` })
      const b = await makeUser('mail-legacy-b')
      const res = await api('PATCH', '/api/v1/auth/me', await loginToken(b), { name: 'B Person', email: `${tag}.legacy@example.com` })
      expect(res.status).toBe(409)
      expect((await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).email).toBeNull()
      expect(old.id).not.toBe(b.id)
    })

    it('checks the form and needs a login', async () => {
      const u = await makeUser('invalid')
      const tok = await loginToken(u)
      expect((await api('PATCH', '/api/v1/auth/me', tok, { name: 'A' })).status).toBe(400)
      expect((await api('PATCH', '/api/v1/auth/me', tok, { name: 'Valid Name', email: 'not-an-email' })).status).toBe(400)
      expect((await api('PATCH', '/api/v1/auth/me', undefined, { name: 'Valid Name' })).status).toBe(401)
      expect((await api('PATCH', '/api/v1/auth/me', 'garbage', { name: 'Valid Name' })).status).toBe(401)
    })

    it("keeps a manager's company details when they edit their profile", async () => {
      const tok = await loginToken(manager)
      const res = await api('PATCH', '/api/v1/auth/me', tok, { name: `${tag} manager renamed` })
      expect(res.status).toBe(200)
      expect(res.body.data.user.staff).toMatchObject({ role: 'MANAGER', operatorId: operator.id, companyName: `${tag} Co` })
    })
  })

  // ─── Changing my password ───────────────────────────────
  describe('changing my password', () => {
    it('needs the right current password, and changes nothing when it is wrong', async () => {
      const u = await makeUser('pw-wrong')
      const tok = await loginToken(u)
      const res = await api('POST', '/api/v1/auth/change-password', tok, { currentPassword: 'not-it', newPassword: 'brand-new-pass' })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/current password/i)
      expect((await login(u.phone, 'start-pass')).status).toBe(200)
      expect((await login(u.phone, 'brand-new-pass')).status).toBe(401)
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).tokenVersion).toBe(0)
    })

    it('keeps the minimum at 6 characters, and refuses the same password again', async () => {
      const u = await makeUser('pw-min')
      const tok = await loginToken(u)
      expect((await api('POST', '/api/v1/auth/change-password', tok, { currentPassword: 'start-pass', newPassword: '12345' })).status).toBe(400)
      expect((await api('POST', '/api/v1/auth/change-password', tok, { currentPassword: 'start-pass', newPassword: 'start-pass' })).status).toBe(400)
      expect((await api('POST', '/api/v1/auth/change-password', tok, { currentPassword: 'start-pass', newPassword: 'x'.repeat(101) })).status).toBe(400)
      const ok = await api('POST', '/api/v1/auth/change-password', tok, { currentPassword: 'start-pass', newPassword: '123456' })
      expect(ok.status, JSON.stringify(ok.body)).toBe(200)
      expect((await login(u.phone, '123456')).status).toBe(200)
    })

    it('switches to the new password, gives this device a fresh login, and logs out the old ones', async () => {
      const u = await makeUser('pw-ok')
      const thisDevice = await loginToken(u)
      const otherDevice = await loginToken(u)
      expect((await api('GET', '/api/v1/auth/me', otherDevice)).status).toBe(200)

      const res = await api('POST', '/api/v1/auth/change-password', thisDevice, { currentPassword: 'start-pass', newPassword: 'brand-new-pass' })
      expect(res.status, JSON.stringify(res.body)).toBe(200)

      // the old password is dead, the new one works
      expect((await login(u.phone, 'start-pass')).status).toBe(401)
      expect((await login(u.phone, 'brand-new-pass')).status).toBe(200)
      // the device that changed it carries on with the token it was just given
      expect((await api('GET', '/api/v1/auth/me', res.body.data.token)).status).toBe(200)
      // every login that existed before is over, this device's old token included
      expect((await api('GET', '/api/v1/auth/me', otherDevice)).status).toBe(401)
      expect((await api('GET', '/api/v1/auth/me', thisDevice)).status).toBe(401)

      const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } })
      expect(row.tokenVersion).toBe(1)
      expect(row.passwordChangedAt).not.toBeNull()
      expect(row.mustChangePassword).toBe(false)
      expect(row.password).not.toBe('brand-new-pass')
    })

    it('does not log anyone out at deploy time: a token made before session numbers existed still works until the password changes', async () => {
      const u = await makeUser('pw-legacy')
      const legacy = jwt.sign({ userId: u.id, role: 'CUSTOMER' }, process.env.JWT_SECRET!) // no session number at all
      expect((await api('GET', '/api/v1/auth/me', legacy)).status).toBe(200)
      const ok = await api('POST', '/api/v1/auth/change-password', legacy, { currentPassword: 'start-pass', newPassword: 'brand-new-pass' })
      expect(ok.status).toBe(200)
      expect((await api('GET', '/api/v1/auth/me', legacy)).status).toBe(401)
    })

    it('needs a login', async () => {
      expect((await api('POST', '/api/v1/auth/change-password', undefined, { currentPassword: 'a', newPassword: 'bbbbbb' })).status).toBe(401)
    })

    it('stops a deleted account at once, even with a token that has not expired', async () => {
      const u = await makeUser('pw-deleted')
      const tok = await loginToken(u)
      await prisma.user.delete({ where: { id: u.id } })
      created.users.delete(u.id)
      expect((await api('GET', '/api/v1/auth/me', tok)).status).toBe(401)
      expect((await api('GET', '/api/v1/bookings/my', tok)).status).toBe(401)
    })

    it('limits wrong guesses of the current password, per account', async () => {
      const u = await makeUser('pw-limit')
      const other = await makeUser('pw-limit-other')
      const tok = await loginToken(u)
      for (let i = 0; i < 10; i++) {
        expect((await api('POST', '/api/v1/auth/change-password', tok, { currentPassword: `guess-${i}`, newPassword: 'brand-new-pass' })).status).toBe(400)
      }
      // the 11th try is stopped, even with the right password
      const blocked = await api('POST', '/api/v1/auth/change-password', tok, { currentPassword: 'start-pass', newPassword: 'brand-new-pass' })
      expect(blocked.status).toBe(429)
      expect((await login(u.phone, 'start-pass')).status).toBe(200) // nothing changed
      // another person is not affected
      const otherTok = await loginToken(other)
      expect((await api('POST', '/api/v1/auth/change-password', otherTok, { currentPassword: 'start-pass', newPassword: 'brand-new-pass' })).status).toBe(200)
    })
  })

  // ─── Temporary passwords ────────────────────────────────
  describe('a temporary password must be replaced first', () => {
    it('lets the person in, but only to change the password', async () => {
      const u = await makeUser('forced', 'CUSTOMER', 'temp-pass', { mustChangePassword: true })
      const sign = await login(u.phone, 'temp-pass')
      expect(sign.status).toBe(200)
      expect(sign.body.data.user.mustChangePassword).toBe(true)
      const tok = sign.body.data.token

      // "who am I" works (the web app needs it), everything else is refused with a code the web app understands
      const me = await api('GET', '/api/v1/auth/me', tok)
      expect(me.status).toBe(200)
      expect(me.body.data.user.mustChangePassword).toBe(true)
      for (const [method, path, body] of [
        ['GET', '/api/v1/bookings/my'],
        ['PATCH', '/api/v1/auth/me', { name: 'Someone Else' }],
        ['POST', '/api/v1/bookings', {}],
      ] as const) {
        const res = await api(method, path, tok, body)
        expect(res.status, `${method} ${path}`).toBe(403)
        expect(res.body.code, `${method} ${path}`).toBe('PASSWORD_CHANGE_REQUIRED')
      }

      // a wrong current password does not unlock it
      expect((await api('POST', '/api/v1/auth/change-password', tok, { currentPassword: 'wrong', newPassword: 'my-own-pass' })).status).toBe(400)
      expect((await api('GET', '/api/v1/bookings/my', tok)).status).toBe(403)

      // choosing a new password unlocks everything
      const changed = await api('POST', '/api/v1/auth/change-password', tok, { currentPassword: 'temp-pass', newPassword: 'my-own-pass' })
      expect(changed.status).toBe(200)
      expect((await api('GET', '/api/v1/bookings/my', changed.body.data.token)).status).toBe(200)
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).mustChangePassword).toBe(false)
      const again = await login(u.phone, 'my-own-pass')
      expect(again.body.data.user.mustChangePassword).toBe(false)
    })

    it('applies to staff pages too: a manager with a temporary password can not work until they change it', async () => {
      const m = await makeUser('forced-manager', 'OPERATOR', 'temp-pass', { mustChangePassword: true })
      await prisma.operatorStaff.create({ data: { userId: m.id, operatorId: operator.id, role: 'MANAGER' } })
      const tok = await loginToken(m, 'temp-pass')
      const blocked = await api('GET', '/api/v1/operator/staff', tok)
      expect(blocked.status).toBe(403)
      expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED')
      const changed = await api('POST', '/api/v1/auth/change-password', tok, { currentPassword: 'temp-pass', newPassword: 'my-own-pass' })
      expect((await api('GET', '/api/v1/operator/staff', changed.body.data.token)).status).toBe(200)
    })

    it('starts every staff account a manager creates on a temporary password', async () => {
      const tok = await loginToken(manager)
      const phone = newPhone()
      const made = await api('POST', '/api/v1/operator/staff', tok, { name: `${tag} new seller`, phone, password: 'seller-pass', role: 'SELLER' })
      expect(made.status, JSON.stringify(made.body)).toBe(201)
      const row = await prisma.user.findUniqueOrThrow({ where: { phone } })
      created.users.add(row.id)
      expect(row.mustChangePassword).toBe(true)
      expect((await login(phone, 'seller-pass')).body.data.user.mustChangePassword).toBe(true)
    })

    it("a manager's reset of a seller's password ends the seller's logins and forces a new choice", async () => {
      const tok = await loginToken(manager)
      const seller = await makeUser('reset-seller', 'OPERATOR', 'old-seller-pass')
      const staff = await prisma.operatorStaff.create({ data: { userId: seller.id, operatorId: operator.id, role: 'SELLER' } })
      const sellerTok = await loginToken(seller, 'old-seller-pass')
      expect((await api('GET', '/api/v1/auth/me', sellerTok)).status).toBe(200)

      const res = await api('POST', `/api/v1/operator/staff/${staff.id}/password`, tok, { password: 'temp-seller-pass' })
      expect(res.status).toBe(200)
      expect((await api('GET', '/api/v1/auth/me', sellerTok)).status).toBe(401)
      expect((await login(seller.phone, 'old-seller-pass')).status).toBe(401)
      const again = await login(seller.phone, 'temp-seller-pass')
      expect(again.status).toBe(200)
      expect(again.body.data.user.mustChangePassword).toBe(true)
    })
  })

  // ─── The admin resets a passenger's password ────────────
  describe('admin resets a password (no SMS yet)', () => {
    it("sets a temporary password for a passenger, ends their logins and makes them choose a new one", async () => {
      const p = await makeUser('forgetful')
      const oldTok = await loginToken(p)
      const res = await api('POST', `/api/v1/admin/users/${p.id}/password`, tokAdmin, { password: 'temp-123' })
      expect(res.status, JSON.stringify(res.body)).toBe(200)
      expect(JSON.stringify(res.body)).not.toContain('temp-123')

      expect((await api('GET', '/api/v1/auth/me', oldTok)).status).toBe(401)
      expect((await login(p.phone, 'start-pass')).status).toBe(401)
      const sign = await login(p.phone, 'temp-123')
      expect(sign.status).toBe(200)
      expect(sign.body.data.user.mustChangePassword).toBe(true)
      expect((await api('GET', '/api/v1/bookings/my', sign.body.data.token)).status).toBe(403)

      const done = await api('POST', '/api/v1/auth/change-password', sign.body.data.token, { currentPassword: 'temp-123', newPassword: 'my-own-pass' })
      expect(done.status).toBe(200)
      expect((await api('GET', '/api/v1/bookings/my', done.body.data.token)).status).toBe(200)
    })

    it('checks the new password, the person, and never resets another admin', async () => {
      const p = await makeUser('reset-checks')
      expect((await api('POST', `/api/v1/admin/users/${p.id}/password`, tokAdmin, { password: '123' })).status).toBe(400)
      expect((await api('POST', `/api/v1/admin/users/${p.id}/password`, tokAdmin, {})).status).toBe(400)
      expect((await api('POST', '/api/v1/admin/users/no-such-user/password', tokAdmin, { password: 'temp-123' })).status).toBe(404)
      const otherAdmin = await makeUser('other-admin', 'ADMIN')
      expect((await api('POST', `/api/v1/admin/users/${otherAdmin.id}/password`, tokAdmin, { password: 'temp-123' })).status).toBe(403)
      expect((await login(otherAdmin.phone, 'start-pass')).status).toBe(200) // untouched
      expect((await login(p.phone, 'start-pass')).status).toBe(200) // untouched
    })

    it('is for the admin only: passengers, managers, a demoted admin and a removed admin are refused', async () => {
      const victim = await makeUser('reset-victim')
      const passenger = await makeUser('reset-passenger')
      const demoted = await makeUser('reset-demoted', 'ADMIN')
      const removed = await makeUser('reset-removed', 'ADMIN')
      // Tokens made while they were still admins
      const demotedTok = await loginToken(demoted)
      const removedTok = await loginToken(removed)
      await prisma.user.update({ where: { id: demoted.id }, data: { role: 'CUSTOMER' } })
      await prisma.user.delete({ where: { id: removed.id } })
      created.users.delete(removed.id)

      const url = `/api/v1/admin/users/${victim.id}/password`
      expect((await api('POST', url, undefined, { password: 'temp-123' })).status).toBe(401)
      expect((await api('POST', url, await loginToken(passenger), { password: 'temp-123' })).status).toBe(403)
      expect((await api('POST', url, await loginToken(manager), { password: 'temp-123' })).status).toBe(403)
      expect((await api('POST', url, demotedTok, { password: 'temp-123' })).status).toBe(403)
      expect((await api('POST', url, removedTok, { password: 'temp-123' })).status).toBe(401)
      // nothing happened to the victim
      expect((await login(victim.phone, 'start-pass')).status).toBe(200)
    })
  })
})
