import { describe, it, expect } from 'vitest'
import { toCents, toBirr, commissionCents, isValidBirrAmount, earningLine, summarizeEarnings, shapeSummary } from '../src/lib/money'

const PAST = new Date('2026-01-01T08:00:00Z')
const FUTURE = new Date('2026-12-01T08:00:00Z')
const NOW = new Date('2026-06-01T00:00:00Z')

describe('money maths (cents)', () => {
  it('converts birr to cents without floating point drift', () => {
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(33.33 * 3)).toBe(9999)
    expect(toCents(1234.56)).toBe(123456)
    expect(toBirr(123456)).toBe(1234.56)
  })

  it('takes the platform share rounded to the nearest cent, half up', () => {
    expect(commissionCents(10000, 5)).toBe(500) // 5% of 100.00
    expect(commissionCents(12345, 2.5)).toBe(309) // 308.625 rounds up
    expect(commissionCents(9999, 5)).toBe(500) // 499.95 rounds up
    expect(commissionCents(10000, 0)).toBe(0) // pilot operator
    expect(commissionCents(0, 5)).toBe(0)
  })

  it('accepts only real birr amounts: positive, at most two decimals', () => {
    for (const ok of [1, 0.5, 12.34, 100000]) expect(isValidBirrAmount(ok)).toBe(true)
    for (const bad of [0, -5, 1.234, NaN, Infinity, 0.001]) expect(isValidBirrAmount(bad)).toBe(false)
  })

  it('uses the rate frozen on the booking, and the current rate only when nothing is frozen', () => {
    const frozen = earningLine({ totalPrice: 200, commissionPercent: 5, departureTime: PAST }, 20, NOW)
    expect(frozen.commissionCents).toBe(1000) // 5% of 200.00, not the new 20%
    const unfrozen = earningLine({ totalPrice: 200, commissionPercent: null, departureTime: PAST }, 20, NOW)
    expect(unfrozen.commissionCents).toBe(4000)
    // A frozen 0% really is 0%, it is not "missing"
    const pilot = earningLine({ totalPrice: 200, commissionPercent: 0, departureTime: PAST }, 20, NOW)
    expect(pilot.commissionCents).toBe(0)
  })

  it('only lets sales from trips that already left be paid out', () => {
    const s = summarizeEarnings(
      [
        { totalPrice: 200, commissionPercent: 5, departureTime: PAST },
        { totalPrice: 300, commissionPercent: 5, departureTime: FUTURE },
      ],
      5, 0, NOW
    )
    expect(s.grossCents).toBe(50000)
    expect(s.commissionCents).toBe(2500)
    expect(s.netCents).toBe(47500)
    expect(s.availableCents).toBe(19000)
    expect(s.pendingCents).toBe(28500)
    expect(s.balanceCents).toBe(19000)
  })

  it('subtracts what was already paid, and shows an overpayment instead of hiding it', () => {
    const rows = [{ totalPrice: 200, commissionPercent: 5, departureTime: PAST }]
    expect(summarizeEarnings(rows, 5, 10000, NOW).balanceCents).toBe(9000)
    const over = summarizeEarnings(rows, 5, 25000, NOW)
    expect(over.balanceCents).toBe(-6000)
    const shaped = shapeSummary(over)
    expect(shaped.due).toBe(0)
    expect(shaped.overpaid).toBe(60)
  })

  it('adds up to the cent, however many small tickets there are', () => {
    const rows = Array.from({ length: 1000 }, () => ({ totalPrice: 33.33, commissionPercent: 5, departureTime: PAST }))
    const s = summarizeEarnings(rows, 5, 0, NOW)
    expect(s.grossCents).toBe(3333000)
    // Each ticket rounds on its own (1.6665 -> 167 cents), and the lines add up exactly
    expect(s.commissionCents).toBe(1000 * 167)
    expect(s.grossCents - s.commissionCents).toBe(s.netCents)
  })
})
