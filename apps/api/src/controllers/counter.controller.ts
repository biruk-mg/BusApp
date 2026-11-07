import { Response } from 'express'
import { z } from 'zod'
import QRCode from 'qrcode'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { activeBookingFilter } from '../lib/seats'
import { SaleError, validateTripForSale, lockAndCheckSeats } from '../lib/sales'
import { normalizePhone, phoneVariants } from '../lib/phone'
import { generateTicketCode } from '../lib/ticketCode'
import { addisDateString, addisDayRange, isValidDateString } from '../lib/time'

/** A seller may void their own sale only this long after making it. */
export const SELLER_VOID_MINUTES = 15

const COUNTER_METHODS = ['CASH', 'TELEBIRR', 'CBE_BIRR', 'BANK_TRANSFER'] as const
type CounterMethod = (typeof COUNTER_METHODS)[number]

const saleSchema = z.object({
  scheduleId: z.string().min(1),
  seatNumbers: z.array(z.string()).min(1, 'Choose at least one seat').max(10, 'At most 10 seats per sale'),
  pickupPointId: z.string().optional(),
  dropoffPointId: z.string().optional(),
  passengerName: z.string().trim().min(2, 'Passenger name is required').max(80),
  passengerPhone: z.string().trim().min(1, 'Passenger phone number is required'),
  method: z.enum(COUNTER_METHODS),
  reference: z.string().trim().max(60).optional(),
})

const REFERENCE_RE = /^[A-Z0-9][A-Z0-9_-]{3,39}$/

/** The day the caller asked for (YYYY-MM-DD, Addis Ababa), or today. Sends the error itself. */
function dayFromQuery(req: AuthRequest, res: Response): { date: string; start: Date; end: Date } | null {
  const requested = req.query.date as string | undefined
  const date = requested || addisDateString(new Date())
  if (!isValidDateString(date)) {
    res.status(400).json({ success: false, error: 'Invalid date' })
    return null
  }
  return { date, ...addisDayRange(date) }
}

// ─── Trips the seller can sell on a day ──────────────────
// The company's own open trips that have not left yet.
export const listCounterTrips = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const day = dayFromQuery(req, res)
    if (!day) return
    const now = new Date()

    const trips = await prisma.schedule.findMany({
      where: {
        bus: { operatorId: req.operatorId },
        status: 'OPEN',
        departureTime: { gte: day.start > now ? day.start : now, lt: day.end },
      },
      include: {
        route: true,
        bus: { select: { plateNumber: true, busType: true, totalSeats: true } },
        bookings: { where: activeBookingFilter(now), select: { seatNumbers: true } },
      },
      orderBy: { departureTime: 'asc' },
    })

    res.json({
      success: true,
      data: {
        date: day.date,
        trips: trips.map(({ bookings, ...t }) => ({
          ...t,
          availableSeats: Math.max(0, t.bus.totalSeats - bookings.reduce((n, b) => n + b.seatNumbers.length, 0)),
        })),
      },
    })
  } catch (error) {
    console.error('ListCounterTrips error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Sell tickets at the counter ─────────────────────────
export const createCounterSale = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = saleSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }
    const input = parsed.data
    const pickupPointId = input.pickupPointId || undefined
    const dropoffPointId = input.dropoffPointId || undefined

    const phone = normalizePhone(input.passengerPhone)
    if (!phone) {
      res.status(400).json({ success: false, error: 'Enter a valid passenger phone number, like 0911223344' })
      return
    }

    // Digital payments need the number from the receipt SMS; cash has none
    const method: CounterMethod = input.method
    let reference: string | null = null
    if (method === 'CASH') {
      if (input.reference) {
        res.status(400).json({ success: false, error: 'Cash payments have no transaction number' })
        return
      }
    } else {
      reference = (input.reference ?? '').toUpperCase().replace(/\s+/g, '')
      if (!REFERENCE_RE.test(reference)) {
        res.status(400).json({
          success: false,
          error: 'Enter the transaction number from the payment receipt (letters and numbers, 4 to 40 characters)',
        })
        return
      }
    }

    const operatorId = req.operatorId!
    const staffId = req.staffId!
    const { scheduleId, seatNumbers } = input
    const now = new Date()

    const schedule = await validateTripForSale({ scheduleId, seatNumbers, pickupPointId, dropoffPointId, operatorId, now })

    // Link the ticket to the passenger's account when they have one, so it also
    // shows in their My Bookings.
    const account = await prisma.user.findFirst({
      where: { phone: { in: phoneVariants(phone) } },
      select: { id: true },
    })

    let booking
    for (let attempt = 0; ; attempt++) {
      const ticketCode = generateTicketCode()
      const qrCode = await QRCode.toDataURL(ticketCode)
      try {
        booking = await prisma.$transaction(async (tx) => {
          await lockAndCheckSeats(tx, schedule, seatNumbers, now)

          if (reference) {
            const used = await tx.payment.findFirst({ where: { method, reference }, select: { id: true } })
            if (used) {
              throw new SaleError(409, 'This transaction number was already used for another ticket')
            }
          }

          // The price is always worked out here, never taken from the screen
          const totalPrice = schedule.price * seatNumbers.length

          return tx.booking.create({
            data: {
              userId: account?.id ?? null,
              scheduleId,
              seatNumbers,
              totalPrice,
              status: 'CONFIRMED',
              source: 'COUNTER',
              passengerName: input.passengerName,
              passengerPhone: phone,
              ticketCode,
              soldByStaffId: staffId,
              pickupPointId: pickupPointId ?? null,
              dropoffPointId: dropoffPointId ?? null,
              qrCode,
              payment: { create: { amount: totalPrice, method, reference, status: 'SUCCESS' } },
            },
            include: counterBookingInclude,
          })
        })
        break
      } catch (error) {
        if ((error as { code?: string })?.code === 'P2002') {
          // Someone used this receipt number a moment ago, or (very rarely) the
          // random code collided. Tell the two apart.
          if (reference && (await prisma.payment.findFirst({ where: { method, reference }, select: { id: true } }))) {
            throw new SaleError(409, 'This transaction number was already used for another ticket')
          }
          if (attempt < 4) continue
        }
        throw error
      }
    }

    res.status(201).json({ success: true, message: 'Ticket sold', data: { booking: describeSale(booking, req) } })
  } catch (error) {
    if (error instanceof SaleError) {
      res.status(error.status).json({ success: false, error: error.message })
      return
    }
    console.error('CreateCounterSale error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

const counterBookingInclude = {
  schedule: { include: { route: true, bus: { select: { plateNumber: true, busType: true, operatorId: true } } } },
  pickupPoint: { select: { name: true, offsetMin: true } },
  dropoffPoint: { select: { name: true } },
  payment: { select: { method: true, reference: true, amount: true } },
  soldByStaff: { select: { id: true, user: { select: { name: true } } } },
  voidedByStaff: { select: { user: { select: { name: true } } } },
} satisfies Prisma.BookingInclude

type CounterBooking = Prisma.BookingGetPayload<{ include: typeof counterBookingInclude }>

/** Whether the caller may void this sale right now (and, if not, why not). */
function voidRule(booking: CounterBooking, req: AuthRequest, now = new Date()): { ok: true } | { ok: false; status: number; error: string } {
  if (booking.source !== 'COUNTER') return { ok: false, status: 404, error: 'Sale not found' }
  if (booking.status !== 'CONFIRMED') return { ok: false, status: 409, error: 'This sale is already voided' }
  if (booking.schedule.departureTime <= now) {
    return { ok: false, status: 400, error: 'This trip has already departed, so the sale can no longer be voided' }
  }
  if (req.staffRole === 'MANAGER') return { ok: true }
  if (booking.soldByStaffId !== req.staffId) {
    return { ok: false, status: 403, error: 'You can only void your own sales' }
  }
  if (now.getTime() - booking.createdAt.getTime() > SELLER_VOID_MINUTES * 60 * 1000) {
    return { ok: false, status: 403, error: `You can only void a sale within ${SELLER_VOID_MINUTES} minutes. Ask your manager.` }
  }
  return { ok: true }
}

function describeSale(booking: CounterBooking, req: AuthRequest) {
  return { ...booking, canVoid: voidRule(booking, req).ok }
}

// ─── Sales list ──────────────────────────────────────────
// Sellers see their own sales for the day, managers see the whole company's.
export const listCounterSales = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const day = dayFromQuery(req, res)
    if (!day) return

    const sales = await prisma.booking.findMany({
      where: {
        source: 'COUNTER',
        createdAt: { gte: day.start, lt: day.end },
        schedule: { bus: { operatorId: req.operatorId } },
        ...(req.staffRole === 'SELLER' ? { soldByStaffId: req.staffId } : {}),
      },
      include: counterBookingInclude,
      orderBy: { createdAt: 'desc' },
    })

    res.json({ success: true, data: { date: day.date, sales: sales.map((s) => describeSale(s, req)) } })
  } catch (error) {
    console.error('ListCounterSales error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Void a sale ─────────────────────────────────────────
// Cancels the ticket and frees its seats. Money is handed back by hand.
export const voidCounterSale = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = z.object({ reason: z.string().trim().min(3, 'Please give a reason').max(200) }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id as string },
      include: counterBookingInclude,
    })
    // Another company's sale looks like one that doesn't exist
    if (!booking || booking.schedule.bus.operatorId !== req.operatorId) {
      res.status(404).json({ success: false, error: 'Sale not found' })
      return
    }

    const rule = voidRule(booking, req)
    if (!rule.ok) {
      res.status(rule.status).json({ success: false, error: rule.error })
      return
    }

    const now = new Date()
    const voided = await prisma.$transaction(async (tx) => {
      // Only one caller can win: a second void of the same sale changes nothing
      const changed = await tx.booking.updateMany({
        where: { id: booking.id, status: 'CONFIRMED' },
        data: { status: 'CANCELLED', voidedAt: now, voidedByStaffId: req.staffId, voidReason: parsed.data.reason },
      })
      if (changed.count === 0) throw new SaleError(409, 'This sale is already voided')

      // Free the receipt number so the passenger's real receipt can be used for the corrected sale
      if (booking.payment?.reference) {
        await tx.payment.update({
          where: { bookingId: booking.id },
          data: { voidedReference: booking.payment.reference, reference: null },
        })
      }
      return tx.booking.findUniqueOrThrow({ where: { id: booking.id }, include: counterBookingInclude })
    })

    res.json({ success: true, message: 'Sale voided', data: { booking: describeSale(voided, req) } })
  } catch (error) {
    if (error instanceof SaleError) {
      res.status(error.status).json({ success: false, error: error.message })
      return
    }
    console.error('VoidCounterSale error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Daily report (managers) ─────────────────────────────
// Sales made on a day (by sale time, not trip time), per seller and per payment method.
export const counterReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const day = dayFromQuery(req, res)
    if (!day) return

    const sales = await prisma.booking.findMany({
      where: {
        source: 'COUNTER',
        createdAt: { gte: day.start, lt: day.end },
        schedule: { bus: { operatorId: req.operatorId } },
      },
      select: {
        status: true,
        totalPrice: true,
        seatNumbers: true,
        soldByStaffId: true,
        soldByStaff: { select: { user: { select: { name: true } } } },
        payment: { select: { method: true } },
      },
    })

    type Row = { tickets: number; seats: number; total: number }
    const blank = (): Row => ({ tickets: 0, seats: 0, total: 0 })
    const add = (row: Row, s: (typeof sales)[number]) => {
      row.tickets += 1
      row.seats += s.seatNumbers.length
      row.total += s.totalPrice
    }

    const byMethod: Record<string, Row> = {}
    const bySeller = new Map<string, { staffId: string; name: string; byMethod: Record<string, Row> } & Row>()
    const totals = blank()
    const voided = blank()

    for (const s of sales) {
      if (s.status !== 'CONFIRMED') {
        add(voided, s)
        continue
      }
      const method = s.payment?.method ?? 'UNKNOWN'
      add(totals, s)
      add((byMethod[method] ??= blank()), s)

      const key = s.soldByStaffId ?? 'unknown'
      let seller = bySeller.get(key)
      if (!seller) {
        seller = { staffId: key, name: s.soldByStaff?.user.name ?? 'Unknown', byMethod: {}, ...blank() }
        bySeller.set(key, seller)
      }
      add(seller, s)
      add((seller.byMethod[method] ??= blank()), s)
    }

    res.json({
      success: true,
      data: {
        date: day.date,
        totals,
        byMethod,
        bySeller: Array.from(bySeller.values()).sort((a, b) => b.total - a.total),
        voided,
      },
    })
  } catch (error) {
    console.error('CounterReport error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
