'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export interface OfferBanner {
  id: string
  title: string
  message: string
  badge: string | null
  linkText: string | null
  linkUrl: string | null
  theme: string
}

const THEMES: Record<string, { bg: string; fg: string; sub: string; chip: string; chipFg: string; btnBg: string; btnFg: string }> = {
  red: { bg: 'linear-gradient(135deg, #C0392B, #8E2318)', fg: '#FFFFFF', sub: 'rgba(255,255,255,0.85)', chip: 'rgba(255,255,255,0.2)', chipFg: '#FFFFFF', btnBg: '#FFFFFF', btnFg: '#C0392B' },
  gold: { bg: 'linear-gradient(135deg, #F5C84B, #D4A017)', fg: '#2B1B00', sub: 'rgba(43,27,0,0.8)', chip: 'rgba(43,27,0,0.12)', chipFg: '#2B1B00', btnBg: '#2B1B00', btnFg: '#FFFFFF' },
  green: { bg: 'linear-gradient(135deg, #2E8B57, #1E5C3A)', fg: '#FFFFFF', sub: 'rgba(255,255,255,0.85)', chip: 'rgba(255,255,255,0.2)', chipFg: '#FFFFFF', btnBg: '#FFFFFF', btnFg: '#1E5C3A' },
}

// One offer. Also used by the admin screen so the admin sees exactly what passengers see.
export function BannerSlide({ banner }: { banner: Pick<OfferBanner, 'title' | 'message' | 'badge' | 'linkText' | 'linkUrl' | 'theme'> }) {
  const t = THEMES[banner.theme] || THEMES.red
  const text = banner.linkText || 'Learn more'
  const buttonStyle = {
    display: 'inline-flex', alignItems: 'center', gap: '8px', background: t.btnBg, color: t.btnFg,
    padding: '11px 22px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
  } as const
  const internal = !!banner.linkUrl && banner.linkUrl.startsWith('/')

  return (
    <div style={{ background: t.bg, borderRadius: '16px', padding: 'clamp(18px, 3vw, 26px) clamp(18px, 4vw, 32px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px 24px', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 280px', minWidth: 0 }}>
        {banner.badge && (
          <span style={{ display: 'inline-block', background: t.chip, color: t.chipFg, fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', padding: '4px 10px', borderRadius: '20px', marginBottom: '10px' }}>
            {banner.badge}
          </span>
        )}
        <div style={{ fontSize: 'clamp(18px, 3vw, 24px)', fontWeight: 700, color: t.fg, lineHeight: 1.25 }}>{banner.title}</div>
        {banner.message && <div style={{ fontSize: '14px', color: t.sub, lineHeight: 1.6, marginTop: '6px' }}>{banner.message}</div>}
      </div>
      {banner.linkUrl && (
        internal ? (
          <Link href={banner.linkUrl} style={buttonStyle}>{text} <ArrowRight size={16} /></Link>
        ) : (
          <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" style={buttonStyle}>{text} <ArrowRight size={16} /></a>
        )
      )}
    </div>
  )
}

// The home page offers space: nothing is drawn when there are no active offers.
export default function OffersBanner({ banners }: { banners: OfferBanner[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = banners.length

  useEffect(() => {
    if (count < 2 || paused) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), 6000)
    return () => clearInterval(timer)
  }, [count, paused])

  if (count === 0) return null
  const current = banners[Math.min(index, count - 1)]

  return (
    <div
      className="section-padding"
      style={{ paddingTop: '8px', paddingBottom: '8px' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <BannerSlide key={current.id} banner={current} />
      {count > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
          {banners.map((b, i) => (
            <button
              key={b.id}
              aria-label={`Show offer ${i + 1} of ${count}`}
              onClick={() => setIndex(i)}
              style={{ width: i === index ? '22px' : '8px', height: '8px', borderRadius: '8px', border: 'none', padding: 0, cursor: 'pointer', background: i === index ? '#C0392B' : '#E0E0E0', transition: 'width 0.2s' }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
