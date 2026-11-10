import { Response } from 'express'
import { z } from 'zod'
import type { Payout } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { companyOf } from '../middleware/staff'
import { loadEarnings, loadAllBalances } from '../lib/earnings'
import { isValidBirrAmount, toBirr, toCents } from '../lib/money'

/**
 * Payouts: the platform pays each operator company its share of the ONLINE sales
 * (Chapa pays the platform; the platform passes the money on minus its commission).
 * Everything here is bookkeeping of money that moves outside this app (Telebirr,
 * a bank transfer...): the app records it and keeps the balance honest.
 */

class RuleError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}
const isUniqueError = (e: unknown) => (e as { code?: string })?.code === 'P2002'
const birr = (cents: number) => `ETB ${toBirr(cents).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function fail(res: Response, error: unknown, label: string): void {
  if (error instanceof RuleError) {
    res.status(error.status).json({ success: false, error: error.message })
    return
  }
  console.error(`${label} error:`, error)
  res.status(500).json({ success: false, error: 'Internal server error' })
}

/** The payout fields a company may see (never which admin recorded it). */
const publicPayout = (p: Payout) => ({
  id: p.id,
  amount: p.amount,
  method: p.method,
  reference: p.reference ?? p.voidedReference,
  note: p.note,
  paidAt: p.paidAt,
  voided: p.voidedAt !== null,
  voidReason: p.voidedAt ? p.voidReason : null,
})

const earningsBody = (e: NonNullable<Awaited<ReturnType<typeof loadEarnings>>>) => ({
  company: {
    id: e.operator.id,
    companyName: e.operator.companyName,
    commissionPercent: e.operator.commissionPercent,
    status: e.operator.status,
    isDemo: e.operator.isDemo,
  },
  summary: e.shaped,
  trips: e.trips,
  tripsTruncated: e.tripsTruncated,
  payouts: e.payouts.map(publicPayout),
})

// ─── Admin: every company's balance ──────────────────────
export const listBalances = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = (await loadAllBalances()).sort((a, b) => b.dueCents - a.dueCents || a.companyName.localeCompare(b.companyName))
    const total = rows.filter((r) => !r.isDemo).reduce(
      (t, r) => ({
        gross: t.gross + toCents(r.gross),
        commission: t.commission + toCents(r.commission),
        paid: t.paid + toCents(r.paid),
        due: t.due + r.dueCents,
      }),
      { gross: 0, commission: 0, paid: 0, due: 0 }
    )
    res.json({
      success: true,
      data: {
        companies: rows.map(({ dueCents: _d, ...r }) => r),
        totals: { gross: toBirr(total.gross), commission: toBirr(total.commission), paid: toBirr(total.paid), due: toBirr(total.due) },
      },
    })
  } catch (error) {
    fail(res, error, 'ListBalances')
  }
}

// ─── Admin: one company's statement ──────────────────────
export const getCompanyEarnings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const earnings = await loadEarnings(req.params.id as string)
    if (!earnings) throw new RuleError(404, 'Company not found')
    res.json({ success: true, data: earningsBody(earnings) })
  } catch (error) {
    fail(res, error, 'GetCompanyEarnings')
  }
}

// ─── A company's own earnings (managers only) ────────────
export const getMyEarnings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const operatorId = companyOf(req, res)
    if (!operatorId) return
    const earnings = await loadEarnings(operatorId)
    if (!earnings) throw new RuleError(404, 'Company not found')
    res.json({ success: true, data: earningsBody(earnings) })
  } catch (error) {
    fail(res, error, 'GetMyEarnings')
  }
}

// ─── Admin: record a payout ──────────────────────────────
const METHODS = ['TELEBIRR', 'CBE_BIRR', 'BANK_TRANSFER', 'CASH'] as const
const payoutSchema = z
  .object({
    amount: z.number(),
    method: z.enum(METHODS),
    reference: z.string().trim().max(80).optional(),
    note: z.string().trim().max(300).optional(),
    paidAt: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (!isValidBirrAmount(v.amount) || v.amount > 100_000_000) {
      ctx.addIssue({ code: 'custom', message: 'Enter an amount in birr, with at most two decimals' })
    }
    // A transfer needs its receipt number, so every payout can be traced and none can be entered twice
    if (v.method !== 'CASH' && (v.reference ?? '').length < 3) {
      ctx.addIssue({ code: 'custom', message: 'Enter the receipt or transaction number of the transfer' })
    }
  })

export const createPayout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = payoutSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }
    const { amount, method, note } = parsed.data
    const reference = parsed.data.reference || null
    const operatorId = req.params.id as string

    const now = new Date()
    let paidAt = now
    if (parsed.data.paidAt) {
      paidAt = new Date(parsed.data.paidAt)
      if (Number.isNaN(paidAt.getTime())) {
        res.status(400).json({ success: false, error: 'Invalid payment date' })
        return
      }
      if (paidAt.getTime() > now.getTime() + 5 * 60 * 1000) {
        res.status(400).json({ success: false, error: 'The payment date cannot be in the future' })
        return
      }
    }

    const payout = await prisma.$transaction(async (tx) => {
      // One payout change at a time per company, so two admins can never pay the same money twice
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'payout:' + operatorId}))`
      const earnings = await loadEarnings(operatorId, tx, now)
      if (!earnings) throw new RuleError(404, 'Company not found')

      const due = Math.max(earnings.summary.balanceCents, 0)
      if (toCents(amount) > due) {
        throw new RuleError(
          409,
          due === 0
            ? 'Nothing is due to this company right now.'
            : `${birr(toCents(amount))} is more than the ${birr(due)} that is due now. Only sales from trips that have already left can be paid out.`
        )
      }
      return tx.payout.create({
        data: { operatorId, amount, method, reference, note: note || null, paidAt, createdByUserId: req.userId! },
      })
    })

    res.status(201).json({ success: true, message: 'Payout recorded', data: { payout: publicPayout(payout) } })
  } catch (error) {
    if (isUniqueError(error)) {
      res.status(409).json({ success: false, error: 'This receipt number was already recorded for another payout.' })
      return
    }
    fail(res, error, 'CreatePayout')
  }
}

// ─── Admin: void a payout recorded by mistake ────────────
export const voidPayout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }
    const id = req.params.id as string
    const existing = await prisma.payout.findUnique({ where: { id }, select: { operatorId: true } })
    if (!existing) throw new RuleError(404, 'Payout not found')

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'payout:' + existing.operatorId}))`
      const payout = await tx.payout.findUnique({ where: { id } })
      if (!payout) throw new RuleError(404, 'Payout not found')
      if (payout.voidedAt) throw new RuleError(409, 'This payout is already voided')
      // The receipt number moves aside so the correct entry can use it again
      await tx.payout.update({
        where: { id },
        data: {
          voidedAt: new Date(),
          voidReason: parsed.data.reason,
          voidedByUserId: req.userId!,
          reference: null,
          voidedReference: payout.reference,
        },
      })
    })
    res.json({ success: true, message: 'Payout voided' })
  } catch (error) {
    fail(res, error, 'VoidPayout')
  }
}

// ─── Admin: record that an online payment was refunded ───
// The money is sent back by the admin outside this app (Chapa, Telebirr...). This
// records it, so the booking leaves the "refund needed" list and the company is
// not credited for a sale that was paid back.
const refundSchema = z.object({
  reference: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).optional(),
})

export const recordRefund = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = refundSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }
    const bookingId = req.params.id as string

    const first = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { scheduleId: true, schedule: { select: { bus: { select: { operatorId: true } } } } },
    })
    if (!first) throw new RuleError(404, 'Booking not found')

    await prisma.$transaction(async (tx) => {
      // Same locks, same order, as payouts: the company's money first, then the trip's seats
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'payout:' + first.schedule.bus.operatorId}))`
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${first.scheduleId}))`

      const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { payment: true } })
      if (!booking) throw new RuleError(404, 'Booking not found')
      if (booking.source !== 'ONLINE') throw new RuleError(409, 'Only online payments are refunded here. Counter sales are handled at the counter.')
      const payment = booking.payment
      if (!payment || payment.status !== 'SUCCESS') throw new RuleError(409, 'There is no successful online payment to refund')
      if (payment.refundedAt) throw new RuleError(409, 'This payment is already marked as refunded')
      if (booking.boardedAt) throw new RuleError(409, 'This passenger has already boarded, so the ticket cannot be refunded')

      // A paid ticket that is refunded can no longer be used, and its seats are free again
      if (booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') {
        const cancelled = await tx.booking.updateMany({ where: { id: bookingId, boardedAt: null }, data: { status: 'CANCELLED' } })
        if (cancelled.count === 0) throw new RuleError(409, 'This passenger has already boarded, so the ticket cannot be refunded')
      }
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundedAt: new Date(),
          refundedByUserId: req.userId!,
          refundReference: parsed.data.reference || null,
          refundNote: parsed.data.note || null,
        },
      })
    })
    res.json({ success: true, message: 'Refund recorded' })
  } catch (error) {
    fail(res, error, 'RecordRefund')
  }
}
