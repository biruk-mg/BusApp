import { Response } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { normalizePhone, phoneVariants } from '../lib/phone'
import { addisDateString, addisDayRange } from '../lib/time'

const DAY = 24 * 60 * 60 * 1000
const PHONE = /^(\+2519|09)\d{8}$/
const passwordRule = z.string().min(6, 'Password must be at least 6 characters').max(100)

const createSchema = z.object({
  companyName: z.string().trim().min(2, 'Company name is required').max(100),
  licenseNo: z.string().trim().min(3, 'License number is required').max(40),
  phone: z.string().regex(PHONE, 'Invalid company phone number'),
  managerName: z.string().trim().min(2, 'Manager name is required').max(80),
  managerPhone: z.string().regex(PHONE, 'Invalid manager phone number'),
  managerPassword: passwordRule,
  commissionPercent: z.number().min(0, 'Commission cannot be negative').max(50, 'Commission cannot be above 50%').default(5),
  isDemo: z.boolean().default(false),
  notes: z.string().trim().max(500).optional(),
})

const updateSchema = z
  .object({
    companyName: z.string().trim().min(2).max(100),
    licenseNo: z.string().trim().min(3).max(40),
    phone: z.string().regex(PHONE, 'Invalid company phone number'),
    commissionPercent: z.number().min(0, 'Commission cannot be negative').max(50, 'Commission cannot be above 50%'),
    isDemo: z.boolean(),
    notes: z.string().trim().max(500).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change')

class RuleError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}
const isUniqueError = (e: unknown) => (e as { code?: string })?.code === 'P2002'

function fail(res: Response, error: unknown, label: string): void {
  if (error instanceof RuleError) {
    res.status(error.status).json({ success: false, error: error.message })
    return
  }
  console.error(`${label} error:`, error)
  res.status(500).json({ success: false, error: 'Internal server error' })
}

/** Does this phone number belong to an old-style operator account that the phone-number link could hand a new company to? */
async function legacyOperatorHasPhone(phone: string): Promise<boolean> {
  const canonical = normalizePhone(phone)
  const variants = canonical ? phoneVariants(canonical) : [phone]
  const user = await prisma.user.findFirst({
    where: { phone: { in: variants }, role: 'OPERATOR', staff: null },
    select: { id: true },
  })
  return !!user
}

// ─── Sales numbers (confirmed online and counter sales) ──
interface Totals { tickets: number; total: number }
const blank = (): Totals => ({ tickets: 0, total: 0 })

/**
 * Sales since a moment, per company: confirmed (or completed) bookings only,
 * split into online and counter. Voided counter sales and cancelled bookings
 * are not counted.
 */
async function salesSince(since: Date, until?: Date) {
  const rows = await prisma.booking.findMany({
    where: {
      status: { in: ['CONFIRMED', 'COMPLETED'] },
      createdAt: { gte: since, ...(until ? { lt: until } : {}) },
    },
    select: {
      source: true,
      totalPrice: true,
      schedule: { select: { bus: { select: { operatorId: true, operator: { select: { isDemo: true } } } } } },
    },
  })
  const byOperator = new Map<string, { online: Totals; counter: Totals }>()
  const platform = { online: blank(), counter: blank() }
  for (const r of rows) {
    const id = r.schedule.bus.operatorId
    const entry = byOperator.get(id) ?? { online: blank(), counter: blank() }
    const side = r.source === 'COUNTER' ? 'counter' : 'online'
    entry[side].tickets += 1
    entry[side].total += r.totalPrice
    byOperator.set(id, entry)
    // Demo companies are left out of the platform totals
    if (!r.schedule.bus.operator.isDemo) {
      platform[side].tickets += 1
      platform[side].total += r.totalPrice
    }
  }
  return { byOperator, platform }
}

const managerOf = (staff: { role: string; active: boolean; user: { name: string; phone: string } }[]) => {
  const m = staff.find((s) => s.role === 'MANAGER' && s.active)
  return m ? { name: m.user.name, phone: m.user.phone } : null
}

const companyView = (
  o: Prisma.OperatorGetPayload<{ include: { staff: { include: { user: { select: { name: true; phone: true } } } }; _count: { select: { buses: true } } } }>,
  extra: { upcomingTrips: number; online30: Totals; counter30: Totals }
) => ({
  id: o.id,
  companyName: o.companyName,
  licenseNo: o.licenseNo,
  phone: o.phone,
  status: o.status,
  suspendedAt: o.suspendedAt,
  suspendedReason: o.suspendedReason,
  isDemo: o.isDemo,
  commissionPercent: o.commissionPercent,
  notes: o.notes,
  createdAt: o.createdAt,
  buses: o._count.buses,
  activeStaff: o.staff.filter((s) => s.active).length,
  manager: managerOf(o.staff),
  ...extra,
})

async function upcomingTripsByCompany(): Promise<Map<string, number>> {
  const trips = await prisma.schedule.findMany({
    where: { departureTime: { gt: new Date() }, status: 'OPEN' },
    select: { bus: { select: { operatorId: true } } },
  })
  const counts = new Map<string, number>()
  for (const t of trips) counts.set(t.bus.operatorId, (counts.get(t.bus.operatorId) ?? 0) + 1)
  return counts
}

const companyInclude = {
  staff: { include: { user: { select: { name: true, phone: true } } } },
  _count: { select: { buses: true } },
} as const

// ─── List companies ──────────────────────────────────────
export const listOperators = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [operators, trips, sales] = await Promise.all([
      prisma.operator.findMany({ include: companyInclude, orderBy: { createdAt: 'asc' } }),
      upcomingTripsByCompany(),
      salesSince(new Date(Date.now() - 30 * DAY)),
    ])
    res.json({
      success: true,
      data: {
        operators: operators.map((o) =>
          companyView(o, {
            upcomingTrips: trips.get(o.id) ?? 0,
            online30: sales.byOperator.get(o.id)?.online ?? blank(),
            counter30: sales.byOperator.get(o.id)?.counter ?? blank(),
          })
        ),
      },
    })
  } catch (error) {
    fail(res, error, 'ListOperators')
  }
}

// ─── One company, with its staff ─────────────────────────
export const getOperator = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string
    const operator = await prisma.operator.findUnique({ where: { id }, include: companyInclude })
    if (!operator) throw new RuleError(404, 'Company not found')

    const [trips, sales, pickupPoints] = await Promise.all([
      upcomingTripsByCompany(),
      salesSince(new Date(Date.now() - 30 * DAY)),
      prisma.pickupPoint.count({ where: { operatorId: id } }),
    ])
    res.json({
      success: true,
      data: {
        operator: {
          ...companyView(operator, {
            upcomingTrips: trips.get(id) ?? 0,
            online30: sales.byOperator.get(id)?.online ?? blank(),
            counter30: sales.byOperator.get(id)?.counter ?? blank(),
          }),
          pickupPoints,
          staff: operator.staff
            .map((s) => ({ id: s.id, role: s.role, active: s.active, name: s.user.name, phone: s.user.phone }))
            .sort((a, b) => Number(b.active) - Number(a.active) || a.role.localeCompare(b.role)),
        },
      },
    })
  } catch (error) {
    fail(res, error, 'GetOperator')
  }
}

// ─── Create a company with its first manager ─────────────
// The admin meets the operator, checks the license and creates everything in
// one step. The manager always gets a brand new account (an existing
// passenger account is never taken over).
export const createOperator = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }
    const d = parsed.data

    const managerCanonical = normalizePhone(d.managerPhone)!
    if (await prisma.user.findFirst({ where: { phone: { in: phoneVariants(managerCanonical) } } })) {
      throw new RuleError(409, 'The manager phone number already has an account. The manager needs a new account with their own number.')
    }
    if (await prisma.operator.findUnique({ where: { licenseNo: d.licenseNo } })) {
      throw new RuleError(409, 'A company with this license number already exists')
    }
    // An old-style operator account could otherwise be handed this company by its phone number
    const companyPhoneIsManagerPhone = normalizePhone(d.phone) === managerCanonical
    if (!companyPhoneIsManagerPhone && (await legacyOperatorHasPhone(d.phone))) {
      throw new RuleError(409, 'This company phone number belongs to an existing operator account. Use a different company phone.')
    }

    const hashed = await bcrypt.hash(d.managerPassword, 12)
    const created = await prisma.$transaction(async (tx) => {
      const operator = await tx.operator.create({
        data: {
          companyName: d.companyName,
          licenseNo: d.licenseNo,
          phone: d.phone,
          commissionPercent: d.commissionPercent,
          isDemo: d.isDemo,
          notes: d.notes || null,
        },
      })
      const user = await tx.user.create({
        data: { name: d.managerName, phone: d.managerPhone, password: hashed, role: 'OPERATOR' },
      })
      await tx.operatorStaff.create({ data: { userId: user.id, operatorId: operator.id, role: 'MANAGER' } })
      return operator
    })

    const operator = await prisma.operator.findUniqueOrThrow({ where: { id: created.id }, include: companyInclude })
    res.status(201).json({
      success: true,
      message: 'Company created',
      data: { operator: companyView(operator, { upcomingTrips: 0, online30: blank(), counter30: blank() }) },
    })
  } catch (error) {
    if (isUniqueError(error)) {
      res.status(409).json({ success: false, error: 'This license number or phone number is already registered' })
      return
    }
    fail(res, error, 'CreateOperator')
  }
}

// ─── Edit company details ────────────────────────────────
export const updateOperator = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }
    const id = req.params.id as string
    const current = await prisma.operator.findUnique({ where: { id } })
    if (!current) throw new RuleError(404, 'Company not found')

    const d = parsed.data
    if (d.licenseNo && d.licenseNo !== current.licenseNo && (await prisma.operator.findUnique({ where: { licenseNo: d.licenseNo } }))) {
      throw new RuleError(409, 'A company with this license number already exists')
    }
    if (d.phone && d.phone !== current.phone && (await legacyOperatorHasPhone(d.phone))) {
      throw new RuleError(409, 'This phone number belongs to an existing operator account. Use a different company phone.')
    }

    await prisma.operator.update({ where: { id }, data: d })
    const operator = await prisma.operator.findUniqueOrThrow({ where: { id }, include: companyInclude })
    res.json({
      success: true,
      message: 'Company updated',
      data: { operator: companyView(operator, { upcomingTrips: 0, online30: blank(), counter30: blank() }) },
    })
  } catch (error) {
    if (isUniqueError(error)) {
      res.status(409).json({ success: false, error: 'This license number is already registered' })
      return
    }
    fail(res, error, 'UpdateOperator')
  }
}

// ─── Suspend / reactivate ────────────────────────────────
// A suspended company can't sell, its staff can't work, and its trips vanish
// from search. Bookings that already exist stay valid.
export const suspendOperator = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = z.object({ reason: z.string().trim().min(3, 'Please give a reason').max(200) }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }
    const id = req.params.id as string
    // Only one caller can win: suspending twice changes nothing
    const changed = await prisma.operator.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: parsed.data.reason },
    })
    if (changed.count === 0) {
      const exists = await prisma.operator.findUnique({ where: { id }, select: { id: true } })
      throw new RuleError(exists ? 409 : 404, exists ? 'This company is already suspended' : 'Company not found')
    }
    res.json({ success: true, message: 'Company suspended' })
  } catch (error) {
    fail(res, error, 'SuspendOperator')
  }
}

export const reactivateOperator = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string
    const changed = await prisma.operator.updateMany({
      where: { id, status: 'SUSPENDED' },
      data: { status: 'ACTIVE', suspendedAt: null, suspendedReason: null },
    })
    if (changed.count === 0) {
      const exists = await prisma.operator.findUnique({ where: { id }, select: { id: true } })
      throw new RuleError(exists ? 409 : 404, exists ? 'This company is not suspended' : 'Company not found')
    }
    res.json({ success: true, message: 'Company reactivated' })
  } catch (error) {
    fail(res, error, 'ReactivateOperator')
  }
}

// ─── Reset a staff member's password (managers included) ──
// Managers can't reset each other's passwords (C1), so this is how a manager who
// forgot theirs gets back in.
export const resetCompanyStaffPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = z.object({ password: passwordRule }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }
    const target = await prisma.operatorStaff.findFirst({
      where: { id: req.params.staffId as string, operatorId: req.params.id as string },
      select: { userId: true },
    })
    // A staff member of another company looks like one that doesn't exist
    if (!target) throw new RuleError(404, 'Staff member not found')

    const hashed = await bcrypt.hash(parsed.data.password, 12)
    await prisma.user.update({ where: { id: target.userId }, data: { password: hashed } })
    res.json({ success: true, message: 'Password changed' })
  } catch (error) {
    fail(res, error, 'ResetCompanyStaffPassword')
  }
}

// ─── Things that need the admin's attention ──────────────
type Severity = 'high' | 'medium' | 'info'
interface AttentionItem {
  kind: 'REFUND_NEEDED' | 'NO_MANAGER' | 'NO_BUSES' | 'NO_UPCOMING_TRIPS' | 'SUSPENDED'
  severity: Severity
  title: string
  detail: string
  operatorId?: string
  bookingId?: string
}

async function buildAttention(): Promise<AttentionItem[]> {
  const now = new Date()
  const items: AttentionItem[] = []

  // Passengers who paid online but lost their seat (the seat was taken first)
  const refunds = await prisma.booking.findMany({
    where: {
      source: 'ONLINE',
      status: 'CANCELLED',
      payment: { is: { status: 'SUCCESS', refundedAt: null } },
      createdAt: { gte: new Date(now.getTime() - 60 * DAY) },
    },
    include: {
      user: { select: { name: true, phone: true } },
      schedule: { include: { route: true, bus: { select: { operatorId: true, operator: { select: { companyName: true } } } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  for (const b of refunds) {
    items.push({
      kind: 'REFUND_NEEDED',
      severity: 'high',
      title: `Refund needed: ETB ${b.totalPrice}`,
      detail: `${b.user?.name ?? 'Passenger'} (${b.user?.phone ?? 'no phone'}) paid for ${b.schedule.route.fromCity} → ${b.schedule.route.toCity} with ${b.schedule.bus.operator.companyName}, but the seat was not confirmed.`,
      operatorId: b.schedule.bus.operatorId,
      bookingId: b.id,
    })
  }

  const operators = await prisma.operator.findMany({
    include: { staff: { select: { role: true, active: true } }, _count: { select: { buses: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const soon = await prisma.schedule.findMany({
    where: { departureTime: { gt: now, lt: new Date(now.getTime() + 7 * DAY) }, status: 'OPEN' },
    select: { bus: { select: { operatorId: true } } },
  })
  const withTrips = new Set(soon.map((t) => t.bus.operatorId))

  for (const o of operators) {
    if (o.status === 'SUSPENDED') {
      items.push({ kind: 'SUSPENDED', severity: 'info', title: `${o.companyName} is suspended`, detail: o.suspendedReason ?? '', operatorId: o.id })
      continue
    }
    if (o.isDemo) continue // demo companies are not expected to be complete
    if (!o.staff.some((s) => s.role === 'MANAGER' && s.active)) {
      items.push({ kind: 'NO_MANAGER', severity: 'high', title: `${o.companyName} has no active manager`, detail: 'Nobody can log in to run this company.', operatorId: o.id })
    }
    if (o._count.buses === 0) {
      items.push({ kind: 'NO_BUSES', severity: 'medium', title: `${o.companyName} has no buses`, detail: 'Passengers cannot book until the company adds a bus and trips.', operatorId: o.id })
    } else if (!withTrips.has(o.id)) {
      items.push({ kind: 'NO_UPCOMING_TRIPS', severity: 'medium', title: `${o.companyName} has no trips in the next 7 days`, detail: 'Passengers cannot book this company right now.', operatorId: o.id })
    }
  }

  const rank: Record<Severity, number> = { high: 0, medium: 1, info: 2 }
  return items.sort((a, b) => rank[a.severity] - rank[b.severity])
}

export const getAttention = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: { items: await buildAttention() } })
  } catch (error) {
    fail(res, error, 'GetAttention')
  }
}

// ─── Dashboard ───────────────────────────────────────────
// Demo companies are left out of the sales and trip numbers.
export const getDashboard = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const now = new Date()
    const today = addisDayRange(addisDateString(now))

    const [companies, passengers, todaySales, last30, attention, recent, upcomingTrips] = await Promise.all([
      prisma.operator.groupBy({ by: ['status', 'isDemo'], _count: { _all: true } }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      salesSince(today.start, today.end),
      salesSince(new Date(now.getTime() - 30 * DAY)),
      buildAttention(),
      prisma.booking.findMany({
        where: { schedule: { bus: { operator: { isDemo: false } } } },
        include: {
          user: { select: { name: true, phone: true } },
          schedule: { include: { route: true, bus: { select: { operator: { select: { companyName: true } } } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      prisma.schedule.count({
        where: {
          departureTime: { gt: now, lt: new Date(now.getTime() + 7 * DAY) },
          status: 'OPEN',
          bus: { operator: { status: 'ACTIVE', isDemo: false } },
        },
      }),
    ])

    const count = (pick: (c: (typeof companies)[number]) => boolean) =>
      companies.filter(pick).reduce((n, c) => n + c._count._all, 0)

    res.json({
      success: true,
      data: {
        companies: {
          total: count(() => true),
          active: count((c) => c.status === 'ACTIVE' && !c.isDemo),
          suspended: count((c) => c.status === 'SUSPENDED'),
          demo: count((c) => c.isDemo),
        },
        passengers,
        upcomingTrips,
        today: todaySales.platform,
        last30: last30.platform,
        attention: { total: attention.length, high: attention.filter((a) => a.severity === 'high').length, items: attention.slice(0, 8) },
        recentBookings: recent.map((b) => ({
          id: b.id,
          source: b.source,
          status: b.status,
          totalPrice: b.totalPrice,
          createdAt: b.createdAt,
          passengerName: b.user?.name ?? b.passengerName ?? null,
          passengerPhone: b.user?.phone ?? b.passengerPhone ?? null,
          companyName: b.schedule.bus.operator.companyName,
          fromCity: b.schedule.route.fromCity,
          toCity: b.schedule.route.toCity,
          departureTime: b.schedule.departureTime,
        })),
      },
    })
  } catch (error) {
    fail(res, error, 'GetDashboard')
  }
}
