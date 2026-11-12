'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { assetUrl } from '@/lib/api'
import { useI18n } from '@/i18n/LanguageProvider'

export interface OfferBanner {
  id: string
  title: string
  message: string
  badge: string | null
  linkText: string | null
  linkUrl: string | null
  theme: string
  altText?: string | null
  imageUrl?: string | null
  mobileImageUrl?: string | null
}

type SlideData = Pick<OfferBanner, 'title' | 'message' | 'badge' | 'linkText' | 'linkUrl' | 'theme' | 'altText' | 'imageUrl' | 'mobileImageUrl'>

const THEMES: Record<string, { bg: string; fg: string; sub: string; chip: string; chipFg: string; btnBg: string; btnFg: string }> = {
  red: { bg: 'linear-gradient(135deg, #C0392B, #8E2318)', fg: '#FFFFFF', sub: 'rgba(255,255,255,0.85)', chip: 'rgba(255,255,255,0.2)', chipFg: '#FFFFFF', btnBg: '#FFFFFF', btnFg: '#C0392B' },
  gold: { bg: 'linear-gradient(135deg, #F5C84B, #D4A017)', fg: '#2B1B00', sub: 'rgba(43,27,0,0.8)', chip: 'rgba(43,27,0,0.12)', chipFg: '#2B1B00', btnBg: '#2B1B00', btnFg: '#FFFFFF' },
  green: { bg: 'linear-gradient(135deg, #2E8B57, #1E5C3A)', fg: '#FFFFFF', sub: 'rgba(255,255,255,0.85)', chip: 'rgba(255,255,255,0.2)', chipFg: '#FFFFFF', btnBg: '#FFFFFF', btnFg: '#1E5C3A' },
}

// A link to a page of this site stays in the app; an https link opens safely in a new tab.
function SmartLink({ url, style, children, label }: { url: string; style: React.CSSProperties; children: React.ReactNode; label?: string }) {
  if (url.startsWith('/')) return <Link href={url} style={style} aria-label={label}>{children}</Link>
  return <a href={url} target="_blank" rel="noopener noreferrer" style={style} aria-label={label}>{children}</a>
}

// One offer. Also used by the admin screen so the admin sees exactly what passengers see.
export function BannerSlide({ banner }: { banner: SlideData }) {
  // A designed picture is the whole banner: the whole picture is the link.
  if (banner.imageUrl) {
    const wide = assetUrl(banner.imageUrl)
    const phone = banner.mobileImageUrl ? assetUrl(banner.mobileImageUrl) : null
    const picture = (
      <div className="mb-offer-img" data-has-mobile={phone ? '1' : '0'}>
        <picture>
          {phone && <source media="(max-width: 640px)" srcSet={phone} />}
          <img src={wide} alt={banner.altText || banner.title} draggable={false} />
        </picture>
      </div>
    )
    return banner.linkUrl
      ? <SmartLink url={banner.linkUrl} style={{ display: 'block', textDecoration: 'none' }}>{picture}</SmartLink>
      : picture
  }

  const t = THEMES[banner.theme] || THEMES.red
  const text = banner.linkText || 'Learn more'
  const buttonStyle = {
    display: 'inline-flex', alignItems: 'center', gap: '8px', background: t.btnBg, color: t.btnFg,
    padding: '11px 22px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
  } as const

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
        <SmartLink url={banner.linkUrl} style={buttonStyle}>{text} <ArrowRight size={16} /></SmartLink>
      )}
    </div>
  )
}

const CSS = `
  .mb-offer-img { position: relative; width: 100%; aspect-ratio: 8 / 3; border-radius: 16px; overflow: hidden; background: #F0F0F0; }
  .mb-offer-img picture { display: block; width: 100%; height: 100%; }
  .mb-offer-img img { display: block; width: 100%; height: 100%; object-fit: cover; user-select: none; }
  @media (max-width: 640px) { .mb-offer-img[data-has-mobile="1"] { aspect-ratio: 1 / 1; } }
  .mb-offer-fade { animation: mbOfferFade 0.4s ease; }
  @keyframes mbOfferFade { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .mb-offer-fade { animation: none; } }
  .mb-offer-arrow { position: absolute; top: 50%; transform: translateY(-50%); width: 36px; height: 36px; border-radius: 50%; border: none; background: rgba(255,255,255,0.9); color: #1a1a1a; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 2; }
  .mb-offer-arrow:hover { background: #fff; }
  @media (max-width: 640px) { .mb-offer-arrow { display: none; } }
`

// The home page offers space: nothing is drawn when there are no active offers.
export default function OffersBanner({ banners }: { banners: OfferBanner[] }) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchX = useRef<number | null>(null)
  const count = banners.length

  // Load every picture in advance so sliding never shows an empty box
  useEffect(() => {
    if (typeof Image === 'undefined') return
    for (const b of banners) {
      for (const u of [b.imageUrl, b.mobileImageUrl]) if (u) new Image().src = assetUrl(u)
    }
  }, [banners])

  // Slide by themselves, unless the person asked their device for less motion
  useEffect(() => {
    if (count < 2 || paused) return
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), 6000)
    return () => clearTimeout(timer)
  }, [count, paused, index])

  if (count === 0) return null
  const at = Math.min(index, count - 1)
  const current = banners[at]
  const go = (n: number) => setIndex((n + count) % count)

  return (
    <div
      className="section-padding"
      style={{ paddingTop: '8px', paddingBottom: '8px' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <style>{CSS}</style>
      <div
        style={{ position: 'relative' }}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1))
        }}
      >
        <div key={current.id} className="mb-offer-fade">
          <BannerSlide banner={current} />
        </div>
        {count > 1 && (
          <>
            <button type="button" className="mb-offer-arrow" style={{ left: '12px' }} aria-label={t('banner.prev')} onClick={() => go(at - 1)}><ChevronLeft size={20} /></button>
            <button type="button" className="mb-offer-arrow" style={{ right: '12px' }} aria-label={t('banner.next')} onClick={() => go(at + 1)}><ChevronRight size={20} /></button>
          </>
        )}
      </div>
      {count > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
          {banners.map((b, i) => (
            <button
              key={b.id}
              aria-label={t('banner.show', { i: i + 1, n: count })}
              onClick={() => setIndex(i)}
              style={{ width: i === at ? '22px' : '8px', height: '8px', borderRadius: '8px', border: 'none', padding: 0, cursor: 'pointer', background: i === at ? '#C0392B' : '#E0E0E0', transition: 'width 0.2s' }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
