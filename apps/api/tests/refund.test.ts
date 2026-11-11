import { describe, it, expect } from 'vitest'
import { refundFor, refundPercentFor } from '../src/lib/refund'

const H = 3_600_000
const now = new Date('2026-11-12T08:00:00Z')
const inHours = (h: number) => new Date(now.getTime() + h * H)

describe('refund tiers (the Refund Policy page)', () => {
  it('gives 100% back at 24 hours or more, 50% from 6 up to 24 hours, nothing under 6', () => {
    expect(refundPercentFor(100)).toBe(100)
    expect(refundPercentFor(24)).toBe(100)
    expect(refundPercentFor(23.99)).toBe(50)
    expect(refundPercentFor(6)).toBe(50)
    expect(refundPercentFor(5.99)).toBe(0)
    expect(refundPercentFor(0)).toBe(0)
    expect(refundPercentFor(-3)).toBe(0)
  })

  it('works from the departure time, on the exact boundaries', () => {
    expect(refundFor(120, inHours(24), now).percent).toBe(100)
    expect(refundFor(120, new Date(inHours(24).getTime() - 1), now).percent).toBe(50)
    expect(refundFor(120, inHours(6), now).percent).toBe(50)
    expect(refundFor(120, new Date(inHours(6).getTime() - 1), now).percent).toBe(0)
  })

  it('splits the price into cents that always add up to the price', () => {
    const half = refundFor(120.25, inHours(10), now)
    expect(half.refundAmount + half.keepAmount).toBeCloseTo(120.25, 10)
    expect(half.refundAmount).toBe(60.13) // 6012.5 cents rounds up
    expect(half.keepAmount).toBe(60.12)
    expect(refundFor(0.03, inHours(10), now)).toMatchObject({ refundAmount: 0.02, keepAmount: 0.01 })
    expect(refundFor(120, inHours(1), now)).toMatchObject({ percent: 0, refundAmount: 0, keepAmount: 120 })
    expect(refundFor(120, inHours(48), now)).toMatchObject({ percent: 100, refundAmount: 120, keepAmount: 0 })
  })

  it('always refunds everything when the company or the admin cancels', () => {
    expect(refundFor(120, inHours(1), now, true)).toMatchObject({ percent: 100, refundAmount: 120, keepAmount: 0 })
    expect(refundFor(120, inHours(-5), now, true).percent).toBe(100)
  })
})
