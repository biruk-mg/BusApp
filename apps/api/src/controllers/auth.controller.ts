import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../lib/prisma'

// ─── Validation Schemas ─────────────────────────────────
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().regex(/^(\+2519|09)\d{8}$/, 'Invalid Ethiopian phone number'),
  email: z.string().email('Invalid email').optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

const loginSchema = z.object({
  phone: z.string(),
  password: z.string(),
})

// ─── Generate JWT ────────────────────────────────────────
const generateToken = (userId: string, role: string): string => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
  )
}

// ─── Register ────────────────────────────────────────────
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate input
  const parsed = registerSchema.safeParse(req.body)
console.log('📦 Parsed result:', parsed)
if (!parsed.success) {
  res.status(400).json({
    success: false,
    error: parsed.error.issues[0].message,
  })
  return
}

    const { name, phone, email, password } = parsed.data

    // Check if phone already exists
    const existing = await prisma.user.findUnique({ where: { phone } })
    if (existing) {
      res.status(409).json({
        success: false,
        error: 'Phone number already registered',
      })
      return
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create user
    const user = await prisma.user.create({
      data: { name, phone, email, password: hashedPassword },
      select: { id: true, name: true, phone: true, email: true, role: true, createdAt: true },
    })

    // Generate token
    const token = generateToken(user.id, user.role)

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: { user, token },
    })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Login ───────────────────────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate input
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Phone and password are required',
      })
      return
    }

    const { phone, password } = parsed.data

    // Find user
    const user = await prisma.user.findUnique({ where: { phone } })
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Invalid phone number or password',
      })
      return
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password)
    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        error: 'Invalid phone number or password',
      })
      return
    }

    // Generate token
    const token = generateToken(user.id, user.role)

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
        },
        token,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Get Current User ────────────────────────────────────
export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true, email: true, role: true, createdAt: true },
    })

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }

    res.json({ success: true, data: { user } })
  } catch (error) {
    console.error('GetMe error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
// ─── Get All Users (Admin) ───────────────────────────────
export const getAllUsers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        createdAt: true,
        _count: { select: { bookings: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ success: true, data: { users, total: users.length } })
  } catch (error) {
    console.error('GetAllUsers error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}