import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { distanceKm } from './tracking'
import { getChannel, type NotificationChannel } from './pushChannel'
import {
  ALERT_MAX_POSITION_AGE_SECONDS,
  DEPART_SOON_LATE_MINUTES,
  DEPART_SOON_MINUTES,
  MOVING_ORDER,
  alreadyAtOrPast,
  boardingStops,
  buildMessage,
  dueMovingAlerts,
  newProgress,
  planAlerts,
  type AlertType,
  type Lang,
  type MovingAlertType,
  type Stop,
} from './arrivalAlerts'

/**
 * Sends the "your bus is near" alerts. The rules are in arrivalAlerts.ts; this file reads the
 * database and sends.
 *
 * Two entry points:
 *  - onLocation: called after every bus position the checker's phone sends (TRIP_STARTED,
 *    HALFWAY, NEXT_STOP);
 *  - runDepartSoon: called about once a minute by an outside clock (DEPART_SOON), because the
 *    API sleeps on a free plan and cannot run a clock of its own.
 *
 * Safe to run twice at the same moment: an alert is claimed by inserting its row, and the table
 * has a unique key, so only the request that manages to insert it sends. An alert is therefore
 * sent AT MOST once (if the server dies between claiming and sending, it is lost, never doubled).
 */

const MIN = 60 * 1000
const SEND_CONCURRENCY = 10

export interface RunOptions {
  now?: Date
  /** undefined = the real channel; null = alerts off */
  channel?: NotificationChannel | null
}
export interface RunResult {
  sent: number
  skipped: number
  failed: number
}

const asLang = (v: string): Lang => (v === 'am' || v === 'om' ? v : 'en')
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'

/** Runs `fn` over the items, at most `size` at a time. */
async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
}

interface Job {
  scheduleId: string
  bookingId: string
  userId: string
  stop: Stop
  type: AlertType
  /** Earlier alerts that are no longer useful: recorded, not sent */
  skip: MovingAlertType[]
  position: { lat: number; lng: number } | null
  departure?: Date
}

async function deliver(job: Job, channel: NotificationChannel, result: RunResult): Promise<void> {
  const key = { bookingId: job.bookingId, pickupPointId: job.stop.id }
  // Claim: only one request can insert this row, and only that request sends
  try {
    await prisma.arrivalAlert.create({ data: { scheduleId: job.scheduleId, ...key, type: job.type, status: 'SENT' } })
  } catch (error) {
    if (isUnique(error)) return
    throw error
  }
  if (job.skip.length > 0) {
    await prisma.arrivalAlert.createMany({
      data: job.skip.map((type) => ({ scheduleId: job.scheduleId, ...key, type, status: 'SKIPPED' as const })),
      skipDuplicates: true,
    })
    result.skipped += job.skip.length
  }

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: job.userId } })
  const km = job.position && job.stop.lat !== null && job.stop.lng !== null ? distanceKm(job.position, { lat: job.stop.lat, lng: job.stop.lng }) : null

  const outcomes = await Promise.all(
    subscriptions.map(async (sub) => {
      const message = buildMessage({ type: job.type, lang: asLang(sub.lang), pickupName: job.stop.name, distanceKm: km, departure: job.departure })
      try {
        return { endpoint: sub.endpoint, result: await channel.send(sub, { ...message, url: `/track/${job.bookingId}`, tag: `trip-${job.bookingId}` }) }
      } catch (error) {
        console.error('Alert channel error:', error)
        return { endpoint: sub.endpoint, result: 'FAILED' as const }
      }
    })
  )

  const gone = outcomes.filter((o) => o.result === 'GONE').map((o) => o.endpoint)
  if (gone.length > 0) await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: gone } } })

  if (outcomes.some((o) => o.result === 'OK')) {
    result.sent++
  } else {
    await prisma.arrivalAlert.updateMany({ where: { ...key, type: job.type }, data: { status: 'FAILED' } })
    result.failed++
  }
}

/** Paid ONLINE bookings of a trip, for people who agreed to notifications and have not boarded. */
const candidateBookings = (scheduleId: string) =>
  prisma.booking.findMany({
    where: {
      scheduleId,
      status: 'CONFIRMED',
      source: 'ONLINE',
      userId: { not: null },
      boardedAt: null,
      user: { pushSubscriptions: { some: {} } },
    },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      pickupPointId: true,
      passengers: { select: { pickupPointId: true, boardedAt: true } },
      arrivalAlerts: { select: { pickupPointId: true, type: true } },
    },
  })
type Candidate = Awaited<ReturnType<typeof candidateBookings>>[number]

/** The pickup points of the passengers who still have to board (one booking can have several). */
function pickupIdsOf(booking: Candidate): string[] {
  const ids = new Set<string>()
  if (booking.passengers.length === 0) {
    if (booking.pickupPointId) ids.add(booking.pickupPointId)
  } else {
    for (const p of booking.passengers) if (p.pickupPointId && !p.boardedAt) ids.add(p.pickupPointId)
  }
  return [...ids]
}

const stopsOfTrip = async (trip: { routeId: string; bus: { operatorId: string } }) =>
  boardingStops(
    await prisma.pickupPoint.findMany({
      where: { operatorId: trip.bus.operatorId, routeId: trip.routeId },
      select: { id: true, name: true, lat: true, lng: true, kind: true, sequence: true, offsetMin: true },
    })
  )

/**
 * Called after the checker's phone sent a position. Moves the bus along its pickup points and
 * sends the alerts that became due. Never throws into the caller's request: see the route.
 */
export async function onLocation(scheduleId: string, options: RunOptions = {}): Promise<RunResult> {
  const result: RunResult = { sent: 0, skipped: 0, failed: 0 }
  const now = options.now ?? new Date()
  const channel = options.channel === undefined ? getChannel() : options.channel
  if (!channel) return result

  const trip = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    select: { id: true, routeId: true, startedAt: true, endedAt: true, pickupProgress: true, position: true, bus: { select: { operatorId: true } } },
  })
  if (!trip || !trip.startedAt || trip.endedAt || !trip.position) return result
  const position = trip.position
  if ((now.getTime() - position.recordedAt.getTime()) / 1000 > ALERT_MAX_POSITION_AGE_SECONDS) return result

  const stops = await stopsOfTrip(trip)
  if (stops.length === 0) return result

  // Move the bus along. The condition inside the update means a slower request can never pull it back.
  let progress = trip.pickupProgress
  const reached = newProgress(stops, position, progress)
  if (reached !== null) {
    await prisma.schedule.updateMany({ where: { id: trip.id, OR: [{ pickupProgress: null }, { pickupProgress: { lt: reached } }] }, data: { pickupProgress: reached } })
    progress = reached
  }

  const jobs: Job[] = []
  const skippedOnly: { bookingId: string; pickupPointId: string; types: MovingAlertType[] }[] = []
  for (const booking of await candidateBookings(trip.id)) {
    for (const pickupId of pickupIdsOf(booking)) {
      const index = stops.findIndex((s) => s.id === pickupId)
      if (index < 1) continue // not a boarding point of this route, or the first one (that is DEPART_SOON's)
      const done = new Set(booking.arrivalAlerts.filter((a) => a.pickupPointId === pickupId).map((a) => a.type as string))

      if (alreadyAtOrPast(index, progress)) {
        // The bus is at or past this pickup point: nothing is useful any more, and it is not asked again
        const left = MOVING_ORDER.filter((t) => !done.has(t))
        if (left.length > 0) skippedOnly.push({ bookingId: booking.id, pickupPointId: pickupId, types: [...left] })
        continue
      }
      const plan = planAlerts(dueMovingAlerts(stops, index, progress), done)
      if (plan.send) {
        jobs.push({ scheduleId: trip.id, bookingId: booking.id, userId: booking.userId!, stop: stops[index], type: plan.send, skip: plan.skip, position })
      }
    }
  }

  if (skippedOnly.length > 0) {
    await prisma.arrivalAlert.createMany({
      data: skippedOnly.flatMap((s) => s.types.map((type) => ({ scheduleId: trip.id, bookingId: s.bookingId, pickupPointId: s.pickupPointId, type, status: 'SKIPPED' as const }))),
      skipDuplicates: true,
    })
  }
  await inBatches(jobs, SEND_CONCURRENCY, (job) => deliver(job, channel, result))
  return result
}

/**
 * The reminder for passengers whose pickup point is the first one: sent when the scheduled
 * departure is 30 minutes away. Call it about once a minute. A reminder that is more than
 * 10 minutes late, or for a booking made after the 30-minute mark (the passenger is already on
 * the way), is recorded as skipped and not sent. Trips already started are left alone.
 */
export async function runDepartSoon(options: RunOptions = {}): Promise<RunResult> {
  const result: RunResult = { sent: 0, skipped: 0, failed: 0 }
  const now = options.now ?? new Date()
  const channel = options.channel === undefined ? getChannel() : options.channel
  if (!channel) return result

  const trips = await prisma.schedule.findMany({
    where: { startedAt: null, endedAt: null, departureTime: { gt: now, lte: new Date(now.getTime() + DEPART_SOON_MINUTES * MIN) } },
    select: { id: true, routeId: true, departureTime: true, bus: { select: { operatorId: true } } },
  })

  const jobs: Job[] = []
  const skipRows: { scheduleId: string; bookingId: string; pickupPointId: string }[] = []
  for (const trip of trips) {
    const first = (await stopsOfTrip(trip))[0]
    if (!first) continue
    const dueAt = trip.departureTime.getTime() - DEPART_SOON_MINUTES * MIN
    const tooLate = now.getTime() - dueAt > DEPART_SOON_LATE_MINUTES * MIN

    for (const booking of await candidateBookings(trip.id)) {
      if (!pickupIdsOf(booking).includes(first.id)) continue
      if (booking.arrivalAlerts.some((a) => a.pickupPointId === first.id && a.type === 'DEPART_SOON')) continue
      if (tooLate || booking.createdAt.getTime() > dueAt) {
        skipRows.push({ scheduleId: trip.id, bookingId: booking.id, pickupPointId: first.id })
        continue
      }
      jobs.push({ scheduleId: trip.id, bookingId: booking.id, userId: booking.userId!, stop: first, type: 'DEPART_SOON', skip: [], position: null, departure: trip.departureTime })
    }
  }

  if (skipRows.length > 0) {
    await prisma.arrivalAlert.createMany({ data: skipRows.map((r) => ({ ...r, type: 'DEPART_SOON' as const, status: 'SKIPPED' as const })), skipDuplicates: true })
    result.skipped += skipRows.length
  }
  await inBatches(jobs, SEND_CONCURRENCY, (job) => deliver(job, channel, result))
  return result
}
