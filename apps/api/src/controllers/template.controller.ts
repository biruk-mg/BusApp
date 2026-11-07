import { Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { scopeOf } from '../middleware/staff'
import { generateForTemplate, removeUnbookedFutureTrips, GENERATE_DAYS } from '../lib/recurring'
import { isValidTimeString } from '../lib/time'

const templateSchema = z.object({
  routeId: z.string().min(1),
  busId: z.string().min(1),
  departureTime: z.string().refine(isValidTimeString, 'Departure time must look like 05:00'),
  price: z.number().positive(),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1, 'Choose at least one day of the week')
    .transform((days) => Array.from(new Set(days)).sort((a, b) => a - b)),
})

/**
 * Which company the caller may touch: their own (staff), or all (master admin).
 * Comes from the staff middleware, never from the request. Sends the error itself.
 */
function resolveScope(req: AuthRequest, res: Response): { operatorId: string | null } | null {
  return scopeOf(req, res)
}

const include = {
  route: true,
  bus: { select: { id: true, plateNumber: true, busType: true, totalSeats: true, operatorId: true } },
} as const

// ─── List my recurring schedules ─────────────────────────
export const listTemplates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = resolveScope(req, res)
    if (!scope) return

    const templates = await prisma.scheduleTemplate.findMany({
      where: scope.operatorId ? { bus: { operatorId: scope.operatorId } } : {},
      include,
      orderBy: [{ departureTime: 'asc' }, { createdAt: 'asc' }],
    })

    const now = new Date()
    const upcoming = await prisma.schedule.groupBy({
      by: ['templateId'],
      where: { templateId: { in: templates.map((t) => t.id) }, departureTime: { gt: now } },
      _count: { _all: true },
    })
    const counts = new Map(upcoming.map((u) => [u.templateId, u._count._all]))

    res.json({
      success: true,
      data: { templates: templates.map((t) => ({ ...t, upcomingTrips: counts.get(t.id) ?? 0 })) },
    })
  } catch (error) {
    console.error('ListTemplates error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Create ──────────────────────────────────────────────
export const createTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = templateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }
    const scope = resolveScope(req, res)
    if (!scope) return

    const { routeId, busId } = parsed.data
    const [bus, route] = await Promise.all([
      prisma.bus.findUnique({ where: { id: busId } }),
      prisma.route.findUnique({ where: { id: routeId } }),
    ])
    if (!bus) {
      res.status(404).json({ success: false, error: 'Bus not found' })
      return
    }
    if (!route) {
      res.status(404).json({ success: false, error: 'Route not found' })
      return
    }
    if (scope.operatorId && bus.operatorId !== scope.operatorId) {
      res.status(403).json({ success: false, error: 'You can only schedule your own buses' })
      return
    }

    const template = await prisma.scheduleTemplate.create({ data: parsed.data, include })
    const generated = await generateForTemplate(template)

    // Every single day clashed with another trip of this bus: the schedule
    // would never produce anything, so don't keep it.
    if (generated.created === 0 && generated.skipped.length > 0) {
      await prisma.scheduleTemplate.delete({ where: { id: template.id } })
      res.status(409).json({
        success: false,
        error: 'This bus already has trips that overlap with this time on all of these days',
      })
      return
    }

    res.status(201).json({
      success: true,
      message: `Recurring schedule created. ${generated.created} trips added for the next ${GENERATE_DAYS} days.`,
      data: { template, generated },
    })
  } catch (error) {
    console.error('CreateTemplate error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

/** Loads a template and checks the caller may manage it. Sends the error itself. */
async function loadOwnedTemplate(req: AuthRequest, res: Response) {
  const scope = resolveScope(req, res)
  if (!scope) return null
  const template = await prisma.scheduleTemplate.findUnique({
    where: { id: req.params.id as string },
    include,
  })
  if (!template) {
    res.status(404).json({ success: false, error: 'Recurring schedule not found' })
    return null
  }
  if (scope.operatorId && template.bus.operatorId !== scope.operatorId) {
    res.status(403).json({ success: false, error: 'You can only change your own schedules' })
    return null
  }
  return { template, scope }
}

// ─── Edit ────────────────────────────────────────────────
// Future trips nobody has booked are replaced with the new details.
// Trips with bookings, and trips the operator closed, are left as they are.
export const updateTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = templateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }
    const owned = await loadOwnedTemplate(req, res)
    if (!owned) return

    const [bus, route] = await Promise.all([
      prisma.bus.findUnique({ where: { id: parsed.data.busId } }),
      prisma.route.findUnique({ where: { id: parsed.data.routeId } }),
    ])
    if (!bus || !route) {
      res.status(404).json({ success: false, error: 'Bus or route not found' })
      return
    }
    if (owned.scope.operatorId && bus.operatorId !== owned.scope.operatorId) {
      res.status(403).json({ success: false, error: 'You can only schedule your own buses' })
      return
    }

    const template = await prisma.scheduleTemplate.update({
      where: { id: owned.template.id },
      data: parsed.data,
      include,
    })
    const removed = await removeUnbookedFutureTrips(template.id, new Date(), { onlyOpen: true })
    const generated = await generateForTemplate(template)

    res.json({
      success: true,
      message: 'Recurring schedule updated',
      data: { template, removed, generated },
    })
  } catch (error) {
    console.error('UpdateTemplate error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Pause / resume ──────────────────────────────────────
export const setTemplateActive = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = z.object({ active: z.boolean() }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'active must be true or false' })
      return
    }
    const owned = await loadOwnedTemplate(req, res)
    if (!owned) return

    const template = await prisma.scheduleTemplate.update({
      where: { id: owned.template.id },
      data: { active: parsed.data.active },
      include,
    })

    let removed = 0
    let generated = { created: 0, skipped: [] as { date: string; reason: string }[] }
    if (parsed.data.active) {
      generated = await generateForTemplate(template)
    } else {
      // Pausing: stop generating and remove future trips nobody booked.
      removed = await removeUnbookedFutureTrips(template.id)
    }

    res.json({
      success: true,
      message: parsed.data.active ? 'Recurring schedule resumed' : 'Recurring schedule paused',
      data: { template, removed, generated },
    })
  } catch (error) {
    console.error('SetTemplateActive error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Delete ──────────────────────────────────────────────
// Future trips without bookings are removed; trips with bookings stay as
// normal one-off trips (their link to the template is cleared).
export const deleteTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const owned = await loadOwnedTemplate(req, res)
    if (!owned) return

    const removed = await removeUnbookedFutureTrips(owned.template.id)
    await prisma.scheduleTemplate.delete({ where: { id: owned.template.id } })

    res.json({ success: true, message: 'Recurring schedule deleted', data: { removed } })
  } catch (error) {
    console.error('DeleteTemplate error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
