import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  userId?: string
  userRole?: string
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

export const authorizeAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.userRole !== 'ADMIN') {
    res.status(403).json({ success: false, error: 'Admin access required' })
    return
  }
  next()
}