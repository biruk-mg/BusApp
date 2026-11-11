import Link from 'next/link'
import { SITE } from '@/lib/site'

const COLUMNS = [
  {
    title: 'Travel',
    links: [
      { href: '/search', label: 'Find Buses' },
      { href: '/routes', label: 'All Routes' },
      { href: '/bookings', label: 'My Bookings' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About Us' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Support',
    links: [
      { href: '/help', label: 'Help Center' },
      { href: '/faq', label: 'FAQ' },
      { href: '/refund-policy', label: 'Refund Policy' },
    ],
  },
]

const linkStyle = { fontSize: '12px', color: 'rgba(255,255,255,0.45)', textDecoration: 'none' } as const

export default function Footer() {
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
              Book bus tickets across Ethiopia online. Choose your seat, pay securely and travel with your QR ticket.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '16px' }}>{col.title}</div>
              {col.links.map((l) => (
                <div key={l.href + l.label} style={{ marginBottom: '10px' }}>
                  <Link href={l.href} className="mb-footer-link" style={linkStyle}>{l.label}</Link>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>© 2026 {SITE.name}. All rights reserved.</div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <Link href="/privacy" className="mb-footer-link" style={{ ...linkStyle, color: 'rgba(255,255,255,0.35)' }}>Privacy Policy</Link>
            <Link href="/terms" className="mb-footer-link" style={{ ...linkStyle, color: 'rgba(255,255,255,0.35)' }}>Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
