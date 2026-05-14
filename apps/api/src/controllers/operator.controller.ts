import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

const createBusSchema = z.object({
  plateNumber: z.string().min(2),
  totalSeats: z.number().int().positive(),
  busType: z.enum(['STANDARD', 'LUXURY', 'MINIBUS']),
})

// ─── Get Operator Profile ────────────────────────────────
export const getOperatorProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }

    const operator = await prisma.operator.findFirst({
      where: { phone: user.phone },
      include: {
        buses: {
          include: {
            _count: { select: { schedules: true } }
          }
        },
        _count: { select: { buses: true } }
      }
    })

    res.json({ success: true, data: { operator } })
  } catch (error) {
    console.error('GetOperatorProfile error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Get Operator Buses ──────────────────────────────────
export const getOperatorBuses = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }

    const operator = await prisma.operator.findFirst({
      where: { phone: user.phone }
    })

    if (!operator) {
      res.status(404).json({ success: false, error: 'Operator not found' })
      return
    }

    const buses = await prisma.bus.findMany({
      where: { operatorId: operator.id },
      include: {
        _count: { select: { schedules: true } }
      }
    })

    res.json({ success: true, data: { buses, total: buses.length } })
  } catch (error) {
    console.error('GetOperatorBuses error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Create Bus ──────────────────────────────────────────
export const createBus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!
    const parsed = createBusSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }

    const operator = await prisma.operator.findFirst({
      where: { phone: user.phone }
    })

    if (!operator) {
      res.status(404).json({ success: false, error: 'Operator account not found' })
      return
    }

    const bus = await prisma.bus.create({
      data: {
        operatorId: operator.id,
        plateNumber: parsed.data.plateNumber,
        totalSeats: parsed.data.totalSeats,
        busType: parsed.data.busType,
      }
    })

    res.status(201).json({ success: true, message: 'Bus created', data: { bus } })
  } catch (error) {
    console.error('CreateBus error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Get Operator Bookings ───────────────────────────────
export const getOperatorBookings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }

    const operator = await prisma.operator.findFirst({
      where: { phone: user.phone }
    })

    if (!operator) {
      res.status(404).json({ success: false, error: 'Operator not found' })
      return
    }

    const bookings = await prisma.booking.findMany({
      where: {
        schedule: {
          bus: { operatorId: operator.id }
        }
      },
      include: {
        user: { select: { name: true, phone: true } },
        schedule: {
          include: {
            route: true,
            bus: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const totalRevenue = bookings
      .filter(b => b.status === 'CONFIRMED')
      .reduce((sum, b) => sum + b.totalPrice, 0)

    res.json({
      success: true,
      data: { bookings, total: bookings.length, totalRevenue }
    })
  } catch (error) {
    console.error('GetOperatorBookings error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Get Operator Stats ──────────────────────────────────
export const getOperatorStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }

    const operator = await prisma.operator.findFirst({
      where: { phone: user.phone },
      include: { _count: { select: { buses: true } } }
    })

    if (!operator) {
      res.status(404).json({ success: false, error: 'Operator not found' })
      return
    }

    const bookings = await prisma.booking.findMany({
      where: {
        schedule: { bus: { operatorId: operator.id } }
      },
      select: { totalPrice: true, status: true }
    })

    const totalRevenue = bookings
      .filter(b => b.status === 'CONFIRMED')
      .reduce((sum, b) => sum + b.totalPrice, 0)

    const totalBookings = bookings.length
    const totalBuses = operator._count.buses

    res.json({
      success: true,
      data: { totalRevenue, totalBookings, totalBuses, operatorName: operator.companyName }
    })
  } catch (error) {
    console.error('GetOperatorStats error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}