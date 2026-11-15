import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { describeStaff } from '../lib/staff'
import { passwordRule } from '../lib/password'
import { AuthRequest } from '../middleware/auth'

// ─── Validation Schemas ─────────────────────────────────
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().regex(/^(\+2519|09)\d{8}$/, 'Invalid Ethiopian phone number'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name is too long'),
  email: z.string().trim().email('Invalid email').max(200, 'Email is too long').optional().or(z.literal('')),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: passwordRule,
})

const loginSchema = z.object({
  phone: z.string(),
  password: z.string(),
})

// ─── Generate JWT ────────────────────────────────────────
// `tv` is the account's session number: changing the password raises it, which ends every older login
export const generateToken = (userId: string, role: string, tokenVersion = 0): string => {
  return jwt.sign(
    { userId, role, tv: tokenVersion },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
  )
}

// ─── Register ────────────────────────────────────────────
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate input
  const parsed = registerSchema.safeParse(req.body)
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
    const token = generateToken(user.id, user.role, user.tokenVersion)

    // Staff details tell the web app where to send this person (null for passengers)
    const staff = user.role === 'OPERATOR' ? await describeStaff(user.id) : null

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
          staff,
          mustChangePassword: user.mustChangePassword,
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
      select: {
        id: true, name: true, phone: true, email: true, role: true, createdAt: true,
        mustChangePassword: true, passwordChangedAt: true,
      },
    })

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }

    const staff = user.role === 'OPERATOR' ? await describeStaff(user.id) : null
    res.json({ success: true, data: { user: { ...user, staff } } })
  } catch (error) {
    console.error('GetMe error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Edit my name and email ──────────────────────────────
// The phone number is the login, so only the platform admin can change it (it needs
// an SMS check that does not exist yet). The role and company are never editable here.
export const updateMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = profileSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }
    const userId = req.userId as string
    const email = parsed.data.email ? parsed.data.email.toLowerCase() : null

    if (email) {
      const taken = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, NOT: { id: userId } }, select: { id: true } })
      if (taken) {
        res.status(409).json({ success: false, error: 'This email is already used by another account' })
        return
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { name: parsed.data.name, email },
      select: { id: true, name: true, phone: true, email: true, role: true, createdAt: true },
    })
    const staff = user.role === 'OPERATOR' ? await describeStaff(user.id) : null
    res.json({ success: true, message: 'Profile updated', data: { user: { ...user, staff } } })
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      res.status(409).json({ success: false, error: 'This email is already used by another account' })
      return
    }
    console.error('UpdateMe error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Change my password ──────────────────────────────────
// Needs the current password. On success every OTHER login of this account stops
// working (the session number goes up) and this device gets a fresh token.
export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }
    const { currentPassword, newPassword } = parsed.data
    const userId = req.userId as string

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      res.status(401).json({ success: false, error: 'Your session has ended. Please log in again.' })
      return
    }
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      res.status(400).json({ success: false, error: 'Your current password is not correct' })
      return
    }
    if (currentPassword === newPassword) {
      res.status(400).json({ success: false, error: 'Choose a new password that is different from the current one' })
      return
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        password: await bcrypt.hash(newPassword, 12),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
      select: { id: true, role: true, tokenVersion: true },
    })

    res.json({
      success: true,
      message: 'Password changed. Other devices have been logged out.',
      data: { token: generateToken(updated.id, updated.role, updated.tokenVersion) },
    })
  } catch (error) {
    console.error('ChangePassword error:', error)
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