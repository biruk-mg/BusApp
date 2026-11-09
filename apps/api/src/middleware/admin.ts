import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth'
import { prisma } from '../lib/prisma'

/**
 * Only the platform admin. The role is re-read from the database on every call,
 * because a login token stays valid for days after someone loses the role.
 * Use after `authenticate`.
 */
export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'No token provided' })
      return
    }
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } })
    if (user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' })
      return
    }
    next()
  } catch (error) {
    console.error('requireAdmin error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
