'use client'

import Link from 'next/link'
import { SITE } from '@/lib/site'
import { useI18n } from '@/i18n/LanguageProvider'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import type { MessageKey } from '@/i18n/translate'

const COLUMNS: { title: MessageKey; links: { href: string; label: MessageKey }[] }[] = [
  {
    title: 'footer.travel',
    links: [
      { href: '/search', label: 'footer.findBuses' },
      { href: '/routes', label: 'footer.allRoutes' },
      { href: '/bookings', label: 'footer.myBookings' },
    ],
  },
  {
    title: 'footer.company',
    links: [
      { href: '/about', label: 'footer.about' },
      { href: '/contact', label: 'footer.contact' },
    ],
  },
  {
    title: 'footer.support',
    links: [
      { href: '/help', label: 'footer.help' },
      { href: '/faq', label: 'footer.faq' },
      { href: '/refund-policy', label: 'footer.refund' },
    ],
  },
]

const linkStyle = { fontSize: '12px', color: 'rgba(255,255,255,0.45)', textDecoration: 'none' } as const

export default function Footer() {
  const { t } = useI18n()
  return (
    <footer style={{ background: '#0D0505', padding: 'clamp(32px, 5vw, 48px) clamp(20px, 6vw, 80px) 24px' }}>
      <style>{`
        .mb-footer-grid { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 40px; margin-bottom: 40px; }
        .mb-footer-link:hover { color: white !important; }
        @media (max-width: 1024px) { .mb-footer-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 768px) { .mb-footer-grid { gap: 24px; } }
        @media (max-width: 480px) { .mb-footer-grid { grid-template-columns: 1fr; } }
      `}</style>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div className="mb-footer-grid">
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'white', marginBottom: '12px' }}>
              Mugo<span style={{ color: '#C0392B' }}>Bus</span>
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, maxWidth: '240px' }}>
              {t('footer.tagline')}
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '16px' }}>{t(col.title)}</div>
              {col.links.map((l) => (
                <div key={l.href + l.label} style={{ marginBottom: '10px' }}>
                  <Link href={l.href} className="mb-footer-link" style={linkStyle}>{t(l.label)}</Link>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>{t('footer.rights', { name: SITE.name })}</div>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
            <LanguageSwitcher dark />
            <Link href="/privacy" className="mb-footer-link" style={{ ...linkStyle, color: 'rgba(255,255,255,0.35)' }}>{t('footer.privacy')}</Link>
            <Link href="/terms" className="mb-footer-link" style={{ ...linkStyle, color: 'rgba(255,255,255,0.35)' }}>{t('footer.terms')}</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
