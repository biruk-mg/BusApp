import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { PUBLIC_OPERATOR } from '../lib/visibility'
import { maybeTopUp } from '../lib/recurring'

const POPULAR_LIMIT = 8
const POPULAR_WINDOW_DAYS = 30

// ─── Home page data (public) ─────────────────────────────
// One call for everything the home page needs, so a sleeping free server only
// has to wake up once:
//   routes   every route (for the From / To city lists)
//   popular  routes that have upcoming trips, with the cheapest real price
//   stats    real counts (no made-up numbers)
//   banners  active offers that are inside their dates
export const getHome = async (_req: Request, res: Response): Promise<void> => {
  try {
    maybeTopUp()
    const now = new Date()
    const horizon = new Date(now.getTime() + POPULAR_WINDOW_DAYS * 24 * 3600 * 1000)

    const tripWhere = {
      status: 'OPEN' as const,
      departureTime: { gte: now },
      bus: { operator: { ...PUBLIC_OPERATOR } },
    }

    const [routes, trips, upcomingTrips, companies, banners] = await Promise.all([
      prisma.route.findMany({
        select: { fromCity: true, toCity: true },
        orderBy: [{ fromCity: 'asc' }, { toCity: 'asc' }],
      }),
      prisma.schedule.findMany({
        where: { ...tripWhere, departureTime: { gte: now, lt: horizon } },
        select: {
          price: true,
          departureTime: true,
          route: { select: { id: true, fromCity: true, toCity: true, estimatedDurationMin: true } },
          bus: { select: { operatorId: true } },
        },
        take: 3000,
      }),
      prisma.schedule.count({ where: tripWhere }),
      prisma.operator.count({ where: { ...PUBLIC_OPERATOR } }),
      prisma.banner.findMany({
        where: {
          active: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        take: 5,
        select: {
          id: true, title: true, message: true, badge: true,
          linkText: true, linkUrl: true, theme: true,
        },
      }),
    ])

    // Group the upcoming trips by route
    const byRoute = new Map<string, {
      fromCity: string; toCity: string; durationMin: number
      minPrice: number; tripCount: number; nextDeparture: Date; operators: Set<string>
    }>()
    for (const t of trips) {
      const cur = byRoute.get(t.route.id)
      if (!cur) {
        byRoute.set(t.route.id, {
          fromCity: t.route.fromCity, toCity: t.route.toCity,
          durationMin: t.route.estimatedDurationMin,
          minPrice: t.price, tripCount: 1, nextDeparture: t.departureTime,
          operators: new Set([t.bus.operatorId]),
        })
      } else {
        cur.minPrice = Math.min(cur.minPrice, t.price)
        cur.tripCount += 1
        if (t.departureTime < cur.nextDeparture) cur.nextDeparture = t.departureTime
        cur.operators.add(t.bus.operatorId)
      }
    }

    const popular = [...byRoute.values()]
      .sort((a, b) => b.tripCount - a.tripCount || a.minPrice - b.minPrice || a.fromCity.localeCompare(b.fromCity))
      .slice(0, POPULAR_LIMIT)
      .map((r) => ({
        fromCity: r.fromCity,
        toCity: r.toCity,
        durationMin: r.durationMin,
        minPrice: r.minPrice,
        tripCount: r.tripCount,
        operatorCount: r.operators.size,
        nextDeparture: r.nextDeparture,
      }))

    res.set('Cache-Control', 'public, max-age=60')
    res.json({
      success: true,
      data: {
        routes,
        popular,
        stats: { routes: routes.length, companies, upcomingTrips },
        banners,
      },
    })
  } catch (error) {
    console.error('GetHome error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
