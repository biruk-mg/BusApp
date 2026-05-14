import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'

const createRouteSchema = z.object({
  fromCity: z.string().min(2),
  toCity: z.string().min(2),
  distanceKm: z.number().positive(),
  estimatedDurationMin: z.number().positive(),
})

export const getAllRoutes = async (_req: Request, res: Response): Promise<void> => {
  try {
    const routes = await prisma.route.findMany({
      orderBy: { fromCity: 'asc' },
    })
    res.json({ success: true, data: { routes, total: routes.length } })
  } catch (error) {
    console.error('GetAllRoutes error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

export const getRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string
    const route = await prisma.route.findUnique({ where: { id } })
    if (!route) {
      res.status(404).json({ success: false, error: 'Route not found' })
      return
    }
    res.json({ success: true, data: { route } })
  } catch (error) {
    console.error('GetRoute error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

export const createRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = createRouteSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }

    const { fromCity, toCity, distanceKm, estimatedDurationMin } = parsed.data

    const existing = await prisma.route.findUnique({
      where: { fromCity_toCity: { fromCity, toCity } },
    })
    if (existing) {
      res.status(409).json({ success: false, error: 'Route already exists' })
      return
    }

    const route = await prisma.route.create({
      data: { fromCity, toCity, distanceKm, estimatedDurationMin },
    })

    res.status(201).json({ success: true, message: 'Route created', data: { route } })
  } catch (error) {
    console.error('CreateRoute error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

export const deleteRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string
    await prisma.route.delete({ where: { id } })
    res.json({ success: true, message: 'Route deleted' })
  } catch (error) {
    console.error('DeleteRoute error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}