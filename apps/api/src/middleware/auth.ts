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

/**
 * Checks the login token AND the account, on every request:
 *  - the account must still exist (a deleted account stops working at once);
 *  - the token's session number must match the account's (changing or resetting the
 *    password ends every older login, on every device);
 *  - a person who was given a temporary password may only change it until they have.
 * Tokens made before session numbers existed count as number 0, which is where
 * every account starts, so nobody is logged out when this is first deployed.
 */
const makeAuthenticate =
  (options: { allowPasswordChangePending: boolean }) =>
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'No token provided' })
      return
    }

    const token = authHeader.split(' ')[1]

    let decoded: { userId: string; role: string; tv?: number }
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as typeof decoded
    } catch {
      res.status(401).json({ success: false, error: 'Invalid or expired token' })
      return
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { role: true, tokenVersion: true, mustChangePassword: true },
      })
      if (!user || (decoded.tv ?? 0) !== user.tokenVersion) {
        res.status(401).json({ success: false, error: 'Your session has ended. Please log in again.' })
        return
      }
      if (user.mustChangePassword && !options.allowPasswordChangePending) {
        res.status(403).json({
          success: false,
          code: 'PASSWORD_CHANGE_REQUIRED',
          error: 'Please choose a new password before you continue.',
        })
        return
      }
      req.userId = decoded.userId
      req.userRole = decoded.role // admin and staff powers are re-checked in the database by their own middleware
      next()
    } catch (error) {
      console.error('authenticate error:', error)
      res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }

/** Every normal route. */
export const authenticate = makeAuthenticate({ allowPasswordChangePending: false })

/** Only for "who am I" and "change my password", which a person with a temporary password must be able to use. */
export const authenticateAllowingPasswordChange = makeAuthenticate({ allowPasswordChangePending: true })

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
