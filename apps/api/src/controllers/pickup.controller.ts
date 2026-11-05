import { Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { getOperatorForUser } from '../lib/operator'

const createSchema = z.object({
  routeId: z.string(),
  name: z.string().trim().min(1, 'Name is required').max(60, 'Name is too long'),
  kind: z.enum(['PICKUP', 'DROPOFF', 'BOTH']).default('PICKUP'),
  sequence: z.number().int().min(0).default(0),
  offsetMin: z.number().int().min(0, 'Minutes cannot be negative').max(600).default(0),
})
// For edits, a field that is not sent must stay as it is (no defaults here)
const updateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60, 'Name is too long').optional(),
  kind: z.enum(['PICKUP', 'DROPOFF', 'BOTH']).optional(),
  sequence: z.number().int().min(0).optional(),
  offsetMin: z.number().int().min(0, 'Minutes cannot be negative').max(600).optional(),
})

async function requireOperator(req: AuthRequest, res: Response) {
  const operator = await getOperatorForUser(req.userId!)
  if (!operator) {
    res.status(403).json({ success: false, error: 'An operator account is required' })
    return null
  }
  return operator
}

const isUniqueError = (e: unknown) => (e as { code?: string })?.code === 'P2002'

// ─── List my pickup points (optionally for one route) ────
export const listMyPickupPoints = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const operator = await requireOperator(req, res)
    if (!operator) return
    const routeId = req.query.routeId as string | undefined

    const points = await prisma.pickupPoint.findMany({
      where: { operatorId: operator.id, ...(routeId ? { routeId } : {}) },
      orderBy: [{ routeId: 'asc' }, { sequence: 'asc' }, { offsetMin: 'asc' }],
    })
    res.json({ success: true, data: { pickupPoints: points } })
  } catch (error) {
    console.error('ListMyPickupPoints error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Create ──────────────────────────────────────────────
export const createPickupPoint = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const operator = await requireOperator(req, res)
    if (!operator) return

    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }

    const route = await prisma.route.findUnique({ where: { id: parsed.data.routeId } })
    if (!route) {
      res.status(404).json({ success: false, error: 'Route not found' })
      return
    }

    const pickupPoint = await prisma.pickupPoint.create({
      data: { ...parsed.data, operatorId: operator.id },
    })
    res.status(201).json({ success: true, data: { pickupPoint } })
  } catch (error) {
    if (isUniqueError(error)) {
      res.status(409).json({ success: false, error: 'You already have a point with this name on this route' })
      return
    }
    console.error('CreatePickupPoint error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Update (own points only) ────────────────────────────
export const updatePickupPoint = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const operator = await requireOperator(req, res)
    if (!operator) return
    const id = req.params.id as string

    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }

    const existing = await prisma.pickupPoint.findUnique({ where: { id } })
    if (!existing || existing.operatorId !== operator.id) {
      res.status(404).json({ success: false, error: 'Pickup point not found' })
      return
    }

    const pickupPoint = await prisma.pickupPoint.update({ where: { id }, data: parsed.data })
    res.json({ success: true, data: { pickupPoint } })
  } catch (error) {
    if (isUniqueError(error)) {
      res.status(409).json({ success: false, error: 'You already have a point with this name on this route' })
      return
    }
    console.error('UpdatePickupPoint error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Delete (own points only, and only if nobody booked it) ──
export const deletePickupPoint = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const operator = await requireOperator(req, res)
    if (!operator) return
    const id = req.params.id as string

    const existing = await prisma.pickupPoint.findUnique({ where: { id } })
    if (!existing || existing.operatorId !== operator.id) {
      res.status(404).json({ success: false, error: 'Pickup point not found' })
      return
    }

    const used = await prisma.booking.count({
      where: { OR: [{ pickupPointId: id }, { dropoffPointId: id }] },
    })
    if (used > 0) {
      res.status(409).json({
        success: false,
        error: 'Passengers have already booked this point, so it cannot be deleted',
      })
      return
    }

    await prisma.pickupPoint.delete({ where: { id } })
    res.json({ success: true, message: 'Pickup point deleted' })
  } catch (error) {
    console.error('DeletePickupPoint error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
