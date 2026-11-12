import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { addisDateString } from '../lib/time'
import { toBirr } from '../lib/money'
import { MoneyCents, Period, SALE_BOOKING, isPeriod, periodRange, saleCommissionCents } from '../lib/salesReport'

// ─── Admin: who sold how much ────────────────────────────
// Online and counter sales are always kept apart: only online sales earn the platform commission.

function readPeriod(req: AuthRequest, res: Response): Period | null {
  const raw = req.query.period ?? 'today'
  if (!isPeriod(raw)) {
    res.status(400).json({ success: false, error: 'period must be today, 7d, 30d or month' })
    return null
  }
  return raw
}

export const listSales = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const period = readPeriod(req, res)
    if (!period) return
    const range = periodRange(period)

    const [operators, rows] = await Promise.all([
      prisma.operator.findMany({
        where: { isDemo: false },
        select: { id: true, companyName: true, status: true, commissionPercent: true },
        orderBy: { companyName: 'asc' },
      }),
      prisma.booking.findMany({
        where: { AND: [SALE_BOOKING, { createdAt: { gte: range.from, lt: range.to } }, { schedule: { bus: { operator: { isDemo: false } } } }] },
        select: {
          source: true, status: true, totalPrice: true, refundAmount: true, commissionPercent: true,
          schedule: { select: { bus: { select: { operatorId: true } } } },
        },
      }),
    ])

    const per = new Map(operators.map((o) => [o.id, { online: new MoneyCents(), counter: new MoneyCents(), commission: 0 }]))
    const all = { online: new MoneyCents(), counter: new MoneyCents(), commission: 0 }
    const rate = new Map(operators.map((o) => [o.id, o.commissionPercent]))
    for (const r of rows) {
      const entry = per.get(r.schedule.bus.operatorId)
      if (!entry) continue
      const side = r.source === 'COUNTER' ? 'counter' : 'online'
      entry[side].add(r)
      all[side].add(r)
      if (side === 'online') {
        const c = saleCommissionCents(r, r.commissionPercent, rate.get(r.schedule.bus.operatorId) ?? 0)
        entry.commission += c
        all.commission += c
      }
    }

    const totalCents = all.online.cents + all.counter.cents
    const companies = operators
      .map((o) => {
        const e = per.get(o.id)!
        const cents = e.online.cents + e.counter.cents
        return {
          id: o.id,
          companyName: o.companyName,
          status: o.status,
          online: e.online.out(),
          counter: e.counter.out(),
          total: toBirr(cents),
          commission: toBirr(e.commission),
          share: totalCents > 0 ? Math.round((cents / totalCents) * 1000) / 10 : 0,
          _cents: cents,
        }
      })
      .sort((a, b) => b._cents - a._cents || a.companyName.localeCompare(b.companyName))
      .map(({ _cents, ...rest }) => rest)

    res.json({
      success: true,
      data: {
        period,
        from: range.days[0],
        to: range.days[range.days.length - 1],
        totals: { online: all.online.out(), counter: all.counter.out(), total: toBirr(totalCents), commission: toBirr(all.commission) },
        companies,
      },
    })
  } catch (error) {
    console.error('ListSales error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

export const getCompanySales = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const period = readPeriod(req, res)
    if (!period) return
    const range = periodRange(period)

    const operator = await prisma.operator.findUnique({
      where: { id: req.params.operatorId as string },
      select: { id: true, companyName: true, status: true, isDemo: true, commissionPercent: true },
    })
    if (!operator) {
      res.status(404).json({ success: false, error: 'Company not found' })
      return
    }

    const rows = await prisma.booking.findMany({
      where: { AND: [SALE_BOOKING, { createdAt: { gte: range.from, lt: range.to } }, { schedule: { bus: { operatorId: operator.id } } }] },
      select: {
        source: true, status: true, totalPrice: true, refundAmount: true, commissionPercent: true, createdAt: true,
        schedule: { select: { route: { select: { fromCity: true, toCity: true } } } },
        soldByStaff: { select: { user: { select: { name: true } } } },
        payment: { select: { method: true } },
      },
    })

    type Pair = { online: MoneyCents; counter: MoneyCents }
    const pair = (): Pair => ({ online: new MoneyCents(), counter: new MoneyCents() })
    const online = new MoneyCents()
    const counter = new MoneyCents()
    let commission = 0
    const byRoute = new Map<string, Pair & { fromCity: string; toCity: string }>()
    const byDay = new Map<string, Pair>(range.days.map((d) => [d, pair()]))
    const bySeller = new Map<string, { name: string; total: MoneyCents }>()
    const counterByMethod = new Map<string, MoneyCents>()

    for (const r of rows) {
      const side = r.source === 'COUNTER' ? 'counter' : 'online'
      ;(side === 'counter' ? counter : online).add(r)
      if (side === 'online') commission += saleCommissionCents(r, r.commissionPercent, operator.commissionPercent)

      const { fromCity, toCity } = r.schedule.route
      const key = `${fromCity}→${toCity}`
      const route = byRoute.get(key) ?? { ...pair(), fromCity, toCity }
      route[side].add(r)
      byRoute.set(key, route)

      byDay.get(addisDateString(r.createdAt))?.[side].add(r)

      if (side === 'counter') {
        const name = r.soldByStaff?.user.name ?? 'Unknown'
        const seller = bySeller.get(name) ?? { name, total: new MoneyCents() }
        seller.total.add(r)
        bySeller.set(name, seller)
        const method = r.payment?.method ?? 'UNKNOWN'
        const m = counterByMethod.get(method) ?? new MoneyCents()
        m.add(r)
        counterByMethod.set(method, m)
      }
    }

    const sum = (p: Pair) => p.online.cents + p.counter.cents
    res.json({
      success: true,
      data: {
        period,
        from: range.days[0],
        to: range.days[range.days.length - 1],
        company: { id: operator.id, companyName: operator.companyName, status: operator.status, isDemo: operator.isDemo, commissionPercent: operator.commissionPercent },
        totals: { online: online.out(), counter: counter.out(), total: toBirr(online.cents + counter.cents), commission: toBirr(commission) },
        byRoute: [...byRoute.values()]
          .sort((a, b) => sum(b) - sum(a) || a.fromCity.localeCompare(b.fromCity))
          .map((r) => ({ fromCity: r.fromCity, toCity: r.toCity, online: r.online.out(), counter: r.counter.out(), total: toBirr(sum(r)) })),
        byDay: [...byDay.entries()].map(([date, p]) => ({ date, online: p.online.out(), counter: p.counter.out(), total: toBirr(sum(p)) })),
        bySeller: [...bySeller.values()]
          .sort((a, b) => b.total.cents - a.total.cents || a.name.localeCompare(b.name))
          .map((s) => ({ name: s.name, ...s.total.out() })),
        counterByMethod: [...counterByMethod.entries()]
          .sort((a, b) => b[1].cents - a[1].cents)
          .map(([method, m]) => ({ method, ...m.out() })),
      },
    })
  } catch (error) {
    console.error('GetCompanySales error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
