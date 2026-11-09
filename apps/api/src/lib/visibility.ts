import jwt from 'jsonwebtoken'
import { Request } from 'express'

/**
 * Which companies passengers can see and book.
 * Suspended companies and demo companies are hidden from the public.
 */
export const PUBLIC_OPERATOR = { status: 'ACTIVE', isDemo: false } as const

/**
 * True when the request carries an admin token. Only used to let the admin see
 * hidden companies' trips in the admin pages: it unlocks nothing else.
 */
export function isAdminRequest(req: Request): boolean {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) return false
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET as string) as { role?: string }
    return payload.role === 'ADMIN'
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
