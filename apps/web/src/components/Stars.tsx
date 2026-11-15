import type { RatingSummary } from '@/lib/ratings'

const GOLD = '#D4A017'

/** Five stars, filled up to `value` (read only). */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const filled = Math.round(value)
  return (
    <span aria-label={`${value} out of 5 stars`} style={{ fontSize: `${size}px`, letterSpacing: '1px', whiteSpace: 'nowrap', lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ color: n <= filled ? GOLD : '#DDD' }}>★</span>
      ))}
    </span>
  )
}

/** "★ 4.3 (28)". Nothing at all while a company has too few ratings (the API sends null). */
export function RatingBadge({ rating }: { rating?: RatingSummary | null }) {
  if (!rating) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: '#8A6500', whiteSpace: 'nowrap' }}>
      <span style={{ color: GOLD }}>★</span>
      {rating.average.toFixed(1)}
      <span style={{ fontWeight: 400, color: '#999' }}>({rating.count})</span>
    </span>
  )
}
