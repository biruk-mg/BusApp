import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'

export interface AuthRequest extends Request {
  userId?: string
  userRole?: string
  // Set by the staff middleware (middleware/staff.ts), never from the request:
  operatorId?: string
  staffId?: string
  staffRole?: 'MANAGER' | 'SELLER' | 'CHECKER'
  isAdmin?: boolean
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'No token provided' })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string
      role: string
    }
    req.userId = decoded.userId
    req.userRole = decoded.role
    next()
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' })
  }
}

/**
 * The caller's role as it is in the database right now. A login token stays valid for
 * days, so a token that says ADMIN is not proof that the person is still an admin.
 * A token that says anything else is returned as it is: it can only have less power.
 * Returns undefined when the account no longer exists.
 */
export async function effectiveRole(req: AuthRequest): Promise<string | undefined> {
  if (req.userRole !== 'ADMIN') return req.userRole
  if (!req.userId) return undefined
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } })
  return user?.role
}

/** Platform admin only, re-checked in the database on every call. Use after `authenticate`. */
export const authorizeAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if ((await effectiveRole(req)) !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' })
      return
    }
    next()
  } catch (error) {
    console.error('authorizeAdmin error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
