import { Prisma, PrismaClient, ScheduleTemplate } from '@prisma/client'
import { prisma as defaultPrisma } from './prisma'
import { addDaysToDateString, addisDateString, addisToUtc, weekdayOfDateString } from './time'

/** How many days ahead trips are created for recurring schedules. */
export const GENERATE_DAYS = 30

const MIN = 60 * 1000

export interface GenerateResult {
  created: number
  /** Days that were skipped because the bus already has a trip at that time. */
  skipped: { date: string; reason: string }[]
}

/**
 * The Addis dates (YYYY-MM-DD) on which a template should have a trip,
 * for `days` days starting today (Addis time). Pure function, no database.
 */
export function plannedDates(
  daysOfWeek: number[],
  now: Date,
  days = GENERATE_DAYS
): string[] {
  const today = addisDateString(now)
  const result: string[] = []
  for (let i = 0; i < days; i++) {
    const date = addDaysToDateString(today, i)
    if (daysOfWeek.includes(weekdayOfDateString(date))) result.push(date)
  }
  return result
}

/**
 * Creates the missing trips of one template for the next GENERATE_DAYS days.
 * Safe to run any number of times: trips that already exist (including closed
 * ones) are left alone, and the database unique rule on
 * (templateId, departureTime) stops a second copy even if two runs overlap.
 */
export async function generateForTemplate(
  template: Pick<ScheduleTemplate, 'id' | 'busId' | 'routeId' | 'departureTime' | 'price' | 'daysOfWeek' | 'active'>,
  now = new Date(),
  client: PrismaClient = defaultPrisma
): Promise<GenerateResult> {
  const result: GenerateResult = { created: 0, skipped: [] }
  if (!template.active) return result

  const route = await client.route.findUnique({ where: { id: template.routeId } })
  if (!route) return result

  const existing = await client.schedule.findMany({
    where: { templateId: template.id, departureTime: { gte: now } },
    select: { departureTime: true },
  })
  const have = new Set(existing.map((s) => s.departureTime.getTime()))

  for (const date of plannedDates(template.daysOfWeek, now)) {
    const departure = addisToUtc(date, template.departureTime)
    if (departure <= now) continue // today's time has already passed
    if (have.has(departure.getTime())) continue

    const arrival = new Date(departure.getTime() + route.estimatedDurationMin * MIN)

    // A bus can't be in two places at once
    const overlapping = await client.schedule.findFirst({
      where: { busId: template.busId, departureTime: { lt: arrival }, arrivalTime: { gt: departure } },
      select: { id: true },
    })
    if (overlapping) {
      result.skipped.push({ date, reason: 'This bus already has a trip that overlaps with this time' })
      continue
    }

    try {
      await client.schedule.create({
        data: {
          routeId: template.routeId,
          busId: template.busId,
          departureTime: departure,
          arrivalTime: arrival,
          price: template.price,
          templateId: template.id,
        },
      })
      result.created++
    } catch (error) {
      // Another run created this exact trip a moment ago: that's fine.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue
      throw error
    }
  }
  return result
}

/**
 * Removes the future trips of a template that nobody has booked.
 * Trips that have bookings (even cancelled ones) are always kept.
 * Pass onlyOpen to keep trips the operator closed on purpose.
 */
export async function removeUnbookedFutureTrips(
  templateId: string,
  now = new Date(),
  options: { onlyOpen?: boolean } = {},
  client: PrismaClient = defaultPrisma
): Promise<number> {
  const result = await client.schedule.deleteMany({
    where: {
      templateId,
      departureTime: { gt: now },
      bookings: { none: {} },
      ...(options.onlyOpen ? { status: 'OPEN' as const } : {}),
    },
  })
  return result.count
}

// ─── Background top-up ──────────────────────────────────
// Render's free plan has no cron, so trips are topped up when passengers
// search (and when the server wakes up), at most once an hour.
const TOP_UP_EVERY_MS = 60 * MIN
let lastTopUp = 0
let topUpRunning = false

export async function topUpAllTemplates(client: PrismaClient = defaultPrisma): Promise<void> {
  const templates = await client.scheduleTemplate.findMany({ where: { active: true } })
  for (const template of templates) {
    try {
      await generateForTemplate(template, new Date(), client)
    } catch (error) {
      console.error('Top-up failed for template', template.id, error)
    }
  }
}

/** Starts a top-up in the background if the last one was over an hour ago. Never throws. */
export function maybeTopUp(now = Date.now()): void {
  if (topUpRunning || now - lastTopUp < TOP_UP_EVERY_MS) return
  lastTopUp = now
  topUpRunning = true
  topUpAllTemplates()
    .catch((error) => console.error('Top-up error:', error))
    .finally(() => {
      topUpRunning = false
    })
}
