import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

// Shared layout for the information pages (help, FAQ, contact, policies).
export default function InfoPage({
  title,
  subtitle,
  updated,
  children,
}: {
  title: string
  subtitle?: string
  updated?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <div style={{ background: '#1A0A0A', padding: 'clamp(32px, 6vw, 48px) clamp(20px, 6vw, 80px)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h1 style={{ fontSize: 'clamp(26px, 5vw, 32px)', fontWeight: 700, color: 'white' }}>{title}</h1>
          {subtitle && (
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', marginTop: '10px', maxWidth: '560px', lineHeight: 1.6 }}>{subtitle}</p>
          )}
          {updated && (
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '12px' }}>Last updated: {updated}</p>
          )}
        </div>
      </div>
      <main style={{ flex: 1, padding: 'clamp(24px, 5vw, 40px) clamp(20px, 6vw, 80px)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', background: 'white', border: '1px solid #EEEEEE', borderRadius: '16px', padding: 'clamp(20px, 4vw, 36px)' }}>
          {children}
        </div>
      </main>
      <Footer />
    </div>
  )
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: '19px', fontWeight: 700, color: '#1a1a1a', margin: '28px 0 10px' }}>{children}</h2>
}

export function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: '14.5px', color: '#555', lineHeight: 1.75, margin: '0 0 12px' }}>{children}</p>
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul style={{ fontSize: '14.5px', color: '#555', lineHeight: 1.75, margin: '0 0 12px', paddingLeft: '22px' }}>{children}</ul>
}

export function OL({ children }: { children: React.ReactNode }) {
  return <ol style={{ fontSize: '14.5px', color: '#555', lineHeight: 1.75, margin: '0 0 12px', paddingLeft: '22px' }}>{children}</ol>
}

export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#FEF9E7', border: '1px solid #F0D060', borderRadius: '12px', padding: '14px 16px', fontSize: '14px', color: '#6B5200', lineHeight: 1.65, margin: '16px 0' }}>
      {children}
    </div>
  )
}
