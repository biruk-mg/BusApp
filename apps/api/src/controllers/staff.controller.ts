import { Response } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { companyOf } from '../middleware/staff'

const createSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  phone: z.string().regex(/^(\+2519|09)\d{8}$/, 'Invalid Ethiopian phone number'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  role: z.enum(['MANAGER', 'SELLER', 'CHECKER']),
})

const updateSchema = z
  .object({
    role: z.enum(['MANAGER', 'SELLER', 'CHECKER']).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => v.role !== undefined || v.active !== undefined, 'Nothing to change')

const passwordSchema = z.object({ password: z.string().min(6, 'Password must be at least 6 characters').max(100) })

const isUniqueError = (e: unknown) => (e as { code?: string })?.code === 'P2002'

// Thrown inside a transaction to stop it with a clear message
class StaffRuleError extends Error {}

const publicFields = {
  id: true,
  role: true,
  active: true,
  createdAt: true,
  user: { select: { id: true, name: true, phone: true } },
} as const

// ─── List my company's staff ─────────────────────────────
export const listStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const operatorId = companyOf(req, res)
    if (!operatorId) return
    const staff = await prisma.operatorStaff.findMany({
      where: { operatorId },
      select: publicFields,
      orderBy: [{ active: 'desc' }, { role: 'asc' }, { createdAt: 'asc' }],
    })
    res.json({ success: true, data: { staff } })
  } catch (error) {
    console.error('ListStaff error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Add a staff member (always a brand new account) ─────
// An existing passenger account is never taken over: the manager would then be
// able to set that person's password. A phone number that is already registered
// is refused with a clear message.
export const createStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const operatorId = companyOf(req, res)
    if (!operatorId) return
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }
    const { name, phone, password, role } = parsed.data

    if (await prisma.user.findUnique({ where: { phone } })) {
      res.status(409).json({
        success: false,
        error: 'This phone number already has an account. Staff need a new account with their own number.',
      })
      return
    }

    const hashed = await bcrypt.hash(password, 12)
    const staff = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name, phone, password: hashed, role: 'OPERATOR' } })
      return tx.operatorStaff.create({
        data: { userId: user.id, operatorId, role },
        select: publicFields,
      })
    })
    res.status(201).json({ success: true, message: 'Staff member added', data: { staff } })
  } catch (error) {
    if (isUniqueError(error)) {
      res.status(409).json({ success: false, error: 'This phone number already has an account.' })
      return
    }
    console.error('CreateStaff error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Change role, deactivate or reactivate ───────────────
export const updateStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const operatorId = companyOf(req, res)
    if (!operatorId) return
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }

    const id = req.params.id as string
    const target = await prisma.operatorStaff.findFirst({ where: { id, operatorId } })
    // Someone else's staff member looks exactly like one that doesn't exist
    if (!target) {
      res.status(404).json({ success: false, error: 'Staff member not found' })
      return
    }
    if (target.userId === req.userId) {
      res.status(400).json({
        success: false,
        error: 'You cannot change your own role or access. Ask another manager.',
      })
      return
    }

    const updated = await prisma.$transaction(async (tx) => {
      // One change at a time per company, so two managers can never
      // remove each other and leave the company without a manager.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'staff:' + operatorId}))`

      const current = await tx.operatorStaff.findFirst({ where: { id, operatorId } })
      if (!current) throw new StaffRuleError('Staff member not found')

      const role = parsed.data.role ?? current.role
      const active = parsed.data.active ?? current.active

      const losesManagerPower = current.active && current.role === 'MANAGER' && (!active || role !== 'MANAGER')
      if (losesManagerPower) {
        const others = await tx.operatorStaff.count({
          where: { operatorId, role: 'MANAGER', active: true, id: { not: id } },
        })
        if (others === 0) throw new StaffRuleError('The company must keep at least one active manager')
      }

      const staff = await tx.operatorStaff.update({ where: { id }, data: { role, active }, select: publicFields })
      // Passenger accounts of people who left lose the staff label; the API
      // checks the staff record anyway, this just keeps the web menus right.
      await tx.user.updateMany({
        where: { id: current.userId, role: { in: ['OPERATOR', 'CUSTOMER'] } },
        data: { role: active ? 'OPERATOR' : 'CUSTOMER' },
      })
      return staff
    })

    res.json({ success: true, message: 'Staff member updated', data: { staff: updated } })
  } catch (error) {
    if (error instanceof StaffRuleError) {
      const notFound = error.message === 'Staff member not found'
      res.status(notFound ? 404 : 409).json({ success: false, error: error.message })
      return
    }
    console.error('UpdateStaff error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Reset a seller's or checker's password ──────────────
// Managers' passwords can't be reset by other managers (that would let one
// manager take over another's account); those go through the master admin.
export const resetStaffPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const operatorId = companyOf(req, res)
    if (!operatorId) return
    const parsed = passwordSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }

    const target = await prisma.operatorStaff.findFirst({ where: { id: req.params.id as string, operatorId } })
    if (!target) {
      res.status(404).json({ success: false, error: 'Staff member not found' })
      return
    }
    if (target.role === 'MANAGER') {
      res.status(403).json({ success: false, error: "A manager's password can only be reset by the platform admin" })
      return
    }

    const hashed = await bcrypt.hash(parsed.data.password, 12)
    await prisma.user.update({ where: { id: target.userId }, data: { password: hashed } })
    res.json({ success: true, message: 'Password changed' })
  } catch (error) {
    console.error('ResetStaffPassword error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
