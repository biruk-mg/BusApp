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
// ─── Get Revenue Analytics ───────────────────────────────
export const getRevenueAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return }

    const operator = await prisma.operator.findFirst({ where: { phone: user.phone } })
    if (!operator) { res.status(404).json({ success: false, error: 'Operator not found' }); return }

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - i))
      return date
    })

    const bookings = await prisma.booking.findMany({
      where: {
        schedule: { bus: { operatorId: operator.id } },
        createdAt: { gte: last7Days[0] }
      },
      include: {
        schedule: { include: { route: true, bus: true } }
      }
    })

    const dailyRevenue = last7Days.map(date => {
      const dayBookings = bookings.filter(b => {
        const bookingDate = new Date(b.createdAt)
        return bookingDate.toDateString() === date.toDateString() && b.status === 'CONFIRMED'
      })
      return {
        date: date.toLocaleDateString('en-ET', { weekday: 'short', month: 'short', day: 'numeric' }),
        revenue: dayBookings.reduce((sum, b) => sum + b.totalPrice, 0),
        bookings: dayBookings.length
      }
    })

    const routeRevenue: Record<string, { revenue: number; bookings: number }> = {}
    bookings.forEach(b => {
      if (b.status !== 'CONFIRMED') return
      const routeName = `${b.schedule.route.fromCity} → ${b.schedule.route.toCity}`
      if (!routeRevenue[routeName]) routeRevenue[routeName] = { revenue: 0, bookings: 0 }
      routeRevenue[routeName].revenue += b.totalPrice
      routeRevenue[routeName].bookings += 1
    })

    const today = new Date()
    const todayBookings = bookings.filter(b => new Date(b.createdAt).toDateString() === today.toDateString())
    const todayRevenue = todayBookings.filter(b => b.status === 'CONFIRMED').reduce((sum, b) => sum + b.totalPrice, 0)
    const totalRevenue = bookings.filter(b => b.status === 'CONFIRMED').reduce((sum, b) => sum + b.totalPrice, 0)

    res.json({
      success: true,
      data: {
        dailyRevenue,
        routeRevenue: Object.entries(routeRevenue).map(([route, data]) => ({ route, ...data })),
        todayBookings: todayBookings.length,
        todayRevenue,
        totalRevenue,
        totalBookings: bookings.length,
      }
    })
  } catch (error) {
    console.error('GetRevenueAnalytics error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Get Schedule Availability ───────────────────────────
export const getScheduleAvailability = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return }

    const operator = await prisma.operator.findFirst({ where: { phone: user.phone } })
    if (!operator) { res.status(404).json({ success: false, error: 'Operator not found' }); return }

    const schedules = await prisma.schedule.findMany({
      where: { bus: { operatorId: operator.id } },
      include: {
        route: true,
        bus: true,
        bookings: {
          where: { status: { in: ['PENDING', 'CONFIRMED'] } },
          select: { seatNumbers: true }
        }
      },
      orderBy: { departureTime: 'asc' }
    })

    const result = schedules.map(s => {
      const bookedSeats = s.bookings.flatMap(b => b.seatNumbers)
      const occupancyRate = Math.round((bookedSeats.length / s.bus.totalSeats) * 100)
      return {
        id: s.id,
        route: `${s.route.fromCity} → ${s.route.toCity}`,
        departureTime: s.departureTime,
        arrivalTime: s.arrivalTime,
        price: s.price,
        totalSeats: s.bus.totalSeats,
        bookedSeats: bookedSeats.length,
        availableSeats: s.bus.totalSeats - bookedSeats.length,
        occupancyRate,
        plateNumber: s.bus.plateNumber,
        busType: s.bus.busType,
      }
    })

    res.json({ success: true, data: { schedules: result } })
  } catch (error) {
    console.error('GetScheduleAvailability error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}