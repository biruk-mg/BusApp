import { Prisma, PrismaClient } from '@prisma/client'
import { prisma as defaultPrisma } from './prisma'
import { HOLD_MINUTES, activeBookingFilter, releaseExpiredHolds, seatLabels } from './seats'

/**
 * The seat rules shared by online bookings and counter sales.
 * Both go through exactly this code, under the same per-trip lock, so a
 * counter sale and an online booking can never take the same seat.
 */

/** An expected problem with a sale, with the HTTP status to answer with. */
export class SaleError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export type SaleChannel = 'ONLINE' | 'COUNTER'

export interface TripRequest {
  /** Who is selling: passengers online, or staff at the counter. */
  channel: SaleChannel
  scheduleId: string
  seatNumbers: string[]
  pickupPointId?: string
  dropoffPointId?: string
  /**
   * One entry per seat, each with its own stops. When given, these are checked
   * instead of pickupPointId / dropoffPointId, and must cover exactly the seats.
   */
  passengers?: { seatNumber: string; pickupPointId?: string; dropoffPointId?: string }[]
  /** Counter sales: the trip must belong to this company (else "not found"). */
  operatorId?: string
  now?: Date
}

/**
 * Checks everything about a sale that doesn't need the lock: the trip exists
 * (and belongs to the company, for counter sales), is open and not departed,
 * the seats exist, and the pickup / drop-off points are valid.
 */
export async function validateTripForSale(req: TripRequest, client: PrismaClient = defaultPrisma) {
  const { channel, scheduleId, seatNumbers, operatorId } = req
  const now = req.now ?? new Date()

  if (new Set(seatNumbers).size !== seatNumbers.length) {
    throw new SaleError(400, 'Each seat can only be selected once')
  }
  if (req.passengers) {
    const named = req.passengers.map((p) => p.seatNumber)
    if (new Set(named).size !== named.length || named.length !== seatNumbers.length || !named.every((s) => seatNumbers.includes(s))) {
      throw new SaleError(400, 'Each seat needs exactly one passenger')
    }
  }

  const schedule = await client.schedule.findUnique({
    where: { id: scheduleId },
    include: { bus: { include: { operator: true } } },
  })
  // Another company's trip looks exactly like a trip that doesn't exist
  if (!schedule || (operatorId && schedule.bus.operatorId !== operatorId)) {
    throw new SaleError(404, 'Schedule not found')
  }
  // The platform admin can suspend a company, or mark it as a demo company
  const company = schedule.bus.operator
  if (company.status === 'SUSPENDED') {
    throw new SaleError(409, 'This bus company is not taking bookings right now')
  }
  if (company.isDemo && channel === 'ONLINE') {
    throw new SaleError(409, 'This is a demo company. Online booking is not open for it.')
  }
  if (schedule.status === 'CLOSED') {
    throw new SaleError(409, 'This trip is closed and no longer takes bookings')
  }
  if (schedule.departureTime < now) {
    throw new SaleError(400, 'This schedule has already departed')
  }

  // Only seats that exist on this bus can be booked
  const validSeats = new Set(seatLabels(schedule.bus.totalSeats))
  const unknownSeat = seatNumbers.find((seat) => !validSeats.has(seat))
  if (unknownSeat) throw new SaleError(400, `Seat ${unknownSeat} does not exist on this bus`)

  // Pickup is required when this operator has pickup points on this route;
  // drop-off is always optional (passengers can also ask the driver).
  const points = await client.pickupPoint.findMany({
    where: { operatorId: schedule.bus.operatorId, routeId: schedule.routeId },
  })
  const pickupOptions = points.filter((p) => p.kind !== 'DROPOFF')
  const dropoffOptions = points.filter((p) => p.kind !== 'PICKUP')

  // Every passenger is checked on their own: one passenger's stops can differ from another's
  const stops = req.passengers ?? [{ pickupPointId: req.pickupPointId, dropoffPointId: req.dropoffPointId }]
  for (const { pickupPointId, dropoffPointId } of stops) {
    if (pickupOptions.length > 0) {
      if (!pickupPointId) throw new SaleError(400, 'Please choose your pickup point')
      if (!pickupOptions.some((p) => p.id === pickupPointId)) {
        throw new SaleError(400, 'That pickup point is not available for this trip')
      }
    } else if (pickupPointId) {
      throw new SaleError(400, 'That pickup point is not available for this trip')
    }
    if (dropoffPointId && !dropoffOptions.some((p) => p.id === dropoffPointId)) {
      throw new SaleError(400, 'That drop-off point is not available for this trip')
    }
  }

  return schedule
}

/** The most seats one passenger can hold unpaid at the same time, across all trips. */
export const MAX_UNPAID_SEATS = 10

/**
 * Inside a transaction, BEFORE lockAndCheckSeats: stops one account from holding
 * seats on many trips without paying (which would keep real passengers out).
 * Counts the passenger's online bookings that are still unpaid and inside their hold.
 * Paid bookings, cancelled ones and expired holds do not count.
 *
 * The per-passenger lock is always taken before the per-trip lock (and counter sales
 * and payments only take the per-trip one), so the two locks can never wait on each other.
 */
export async function checkUserHoldLimit(
  tx: Prisma.TransactionClient,
  userId: string,
  newSeatCount: number,
  now = new Date()
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'user:' + userId}))`

  const unpaid = await tx.booking.findMany({
    where: {
      userId,
      source: 'ONLINE',
      status: 'PENDING',
      OR: [
        { expiresAt: { gt: now } },
        { expiresAt: null, createdAt: { gt: new Date(now.getTime() - HOLD_MINUTES * 60 * 1000) } },
      ],
    },
    select: { seatNumbers: true },
  })
  const heldSeats = unpaid.reduce((n, b) => n + b.seatNumbers.length, 0)

  if (heldSeats + newSeatCount > MAX_UNPAID_SEATS) {
    throw new SaleError(
      409,
      heldSeats > 0
        ? `You already hold ${heldSeats} seat${heldSeats === 1 ? '' : 's'} that ${heldSeats === 1 ? 'is' : 'are'} not paid for yet. Please pay for them or cancel them before booking more (limit: ${MAX_UNPAID_SEATS} unpaid seats).`
        : `You can hold at most ${MAX_UNPAID_SEATS} seats at a time.`
    )
  }
}

/**
 * Inside a transaction: takes the per-trip lock, then checks the trip is still
 * open and the seats are still free. One sale at a time per trip: this lock is
 * what stops two people from taking the same seat at the same moment.
 */
export async function lockAndCheckSeats(
  tx: Prisma.TransactionClient,
  schedule: { id: string; bus: { totalSeats: number } },
  seatNumbers: string[],
  now = new Date()
): Promise<void> {
  const scheduleId = schedule.id
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scheduleId}))`

  // The operator may have closed the trip while we were checking things
  const current = await tx.schedule.findUnique({ where: { id: scheduleId }, select: { status: true } })
  if (current?.status === 'CLOSED') {
    throw new SaleError(409, 'This trip is closed and no longer takes bookings')
  }

  // Free seats held by unpaid bookings that ran out of time
  await releaseExpiredHolds(tx, { scheduleId }, now)

  // Seats held by paid bookings and by unpaid bookings still inside their hold
  const existing = await tx.booking.findMany({
    where: { scheduleId, ...activeBookingFilter(now) },
    select: { seatNumbers: true },
  })
  const bookedSeats = existing.flatMap((b) => b.seatNumbers)

  const conflictingSeat = seatNumbers.find((seat) => bookedSeats.includes(seat))
  if (conflictingSeat) throw new SaleError(409, `Seat ${conflictingSeat} is already booked`)

  if (bookedSeats.length + seatNumbers.length > schedule.bus.totalSeats) {
    throw new SaleError(409, 'Not enough seats available')
  }
}
