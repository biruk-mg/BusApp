import jwt from 'jsonwebtoken'
import { Request } from 'express'
import { prisma } from './prisma'

/**
 * Which companies passengers can see and book.
 * Suspended companies and demo companies are hidden from the public.
 */
export const PUBLIC_OPERATOR = { status: 'ACTIVE', isDemo: false } as const

/**
 * True when the request comes from someone who is an admin right now (the token is
 * checked, and so is the database). Only used to let the admin see hidden companies'
 * trips in the admin pages: it unlocks nothing else.
 */
export async function isAdminRequest(req: Request): Promise<boolean> {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) return false
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET as string) as { userId?: string; role?: string }
    if (payload.role !== 'ADMIN' || !payload.userId) return false
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
    return user?.role === 'ADMIN'
  } catch {
    return false
  }
}

/**
 * The only company fields passengers (and public pages) may receive. The full
 * company record also holds the commission rate and the admin's private notes.
 */
export const PUBLIC_OPERATOR_FIELDS = {
  select: { id: true, companyName: true, licenseNo: true, phone: true },
} as const
