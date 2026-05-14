import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'

const createScheduleSchema = z.object({
  routeId: z.string(),
  busId: z.string(),
  departureTime: z.string().datetime(),
  arrivalTime: z.string().datetime(),
  price: z.number().positive(),
})

export const searchSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const fromCity = req.query.fromCity as string
    const toCity = req.query.toCity as string
    const date = req.query.date as string

    if (!fromCity || !toCity || !date) {
      res.status(400).json({ success: false, error: 'fromCity, toCity and date are required' })
      return
    }

    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    const schedules = await prisma.schedule.findMany({
      where: {
        route: {
          fromCity: { equals: fromCity, mode: 'insensitive' },
          toCity: { equals: toCity, mode: 'insensitive' },
        },
        departureTime: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        route: true,
        bus: { include: { operator: true } },
        _count: { select: { bookings: true } },
      },
      orderBy: { departureTime: 'asc' },
    })

    const schedulesWithAvailability = schedules.map((schedule) => ({
      ...schedule,
      availableSeats: schedule.bus.totalSeats - schedule._count.bookings,
      totalSeats: schedule.bus.totalSeats,
    }))

    res.json({
      success: true,
      data: {
        schedules: schedulesWithAvailability,
        total: schedules.length,
      },
    })
  } catch (error) {
    console.error('SearchSchedules error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

export const getAllSchedules = async (_req: Request, res: Response): Promise<void> => {
  try {
    const schedules = await prisma.schedule.findMany({
      include: {
        route: true,
        bus: { include: { operator: true } },
        _count: { select: { bookings: true } },
      },
      orderBy: { departureTime: 'asc' },
    })
    res.json({ success: true, data: { schedules, total: schedules.length } })
  } catch (error) {
    console.error('GetAllSchedules error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

export const createSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = createScheduleSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }

    const { routeId, busId, departureTime, arrivalTime, price } = parsed.data

    const schedule = await prisma.schedule.create({
      data: {
        routeId,
        busId,
        departureTime: new Date(departureTime),
        arrivalTime: new Date(arrivalTime),
        price,
      },
      include: { route: true, bus: true },
    })

    res.status(201).json({ success: true, message: 'Schedule created', data: { schedule } })
  } catch (error) {
    console.error('CreateSchedule error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

export const deleteSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string
    await prisma.schedule.delete({ where: { id } })
    res.json({ success: true, message: 'Schedule deleted' })
  } catch (error) {
    console.error('DeleteSchedule error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}