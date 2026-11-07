import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth'
import { prisma } from '../lib/prisma'
import { getStaffContext, StaffRoleValue } from '../lib/staff'

/**
 * Lets a request through only for active staff with one of the given roles,
 * and attaches the company (req.operatorId) and role (req.staffRole) that
 * the controllers must use. The company ALWAYS comes from here, never from
 * the request body, query or URL.
 *
 * The master admin passes too (with no company: they can act across
 * companies) unless allowAdmin is false. Admin is re-checked in the database,
 * because a token stays valid for days after someone loses the role.
 */
export const requireStaff =
  (roles: StaffRoleValue[], options: { allowAdmin?: boolean } = {}) =>
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId
      if (!userId) {
        res.status(401).json({ success: false, error: 'No token provided' })
        return
      }

      if (req.userRole === 'ADMIN' && options.allowAdmin !== false) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
        if (user?.role === 'ADMIN') {
          req.isAdmin = true
          next()
          return
        }
      }

      const ctx = await getStaffContext(userId)
      if (!ctx) {
        res.status(403).json({ success: false, error: 'Operator staff access required' })
        return
      }
      if (!roles.includes(ctx.role)) {
        res.status(403).json({ success: false, error: 'Your role is not allowed to do this' })
        return
      }
      req.operatorId = ctx.operatorId
      req.staffId = ctx.staffId
      req.staffRole = ctx.role
      next()
    } catch (error) {
      console.error('requireStaff error:', error)
      res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }

/** The company's managers (and the admin). Used for everything an operator did before. */
export const requireManager = requireStaff(['MANAGER'])

/**
 * Which company a request may touch.
 *  - { operatorId: null }  the master admin: all companies
 *  - { operatorId: 'x' }   staff: only their own company
 * Fails closed: if a route forgot the middleware, the caller gets a 403,
 * never admin-wide access.
 */
export function scopeOf(req: AuthRequest, res: Response): { operatorId: string | null } | null {
  if (req.operatorId) return { operatorId: req.operatorId }
  if (req.isAdmin) return { operatorId: null }
  res.status(403).json({ success: false, error: 'Operator staff access required' })
  return null
}

/** For endpoints that only make sense inside one company (buses, pickup points, stats...). */
export function companyOf(req: AuthRequest, res: Response, notFoundStatus = 404): string | null {
  if (req.operatorId) return req.operatorId
  res.status(notFoundStatus).json({ success: false, error: 'Operator not found' })
  return null
}
