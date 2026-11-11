import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

const steps = [
  { n: '1', title: 'Search', text: 'Choose where you are going and the date, and see the trips available.' },
  { n: '2', title: 'Choose your seat and pickup point', text: 'Pick your seat on the bus map and the place where you will board.' },
  { n: '3', title: 'Pay and travel', text: 'Pay online with Chapa and get a ticket with a QR code to show when boarding.' },
]

export default function AboutPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8' }}>
      <Navbar />

      <div className="hero-pad" style={{ background: '#1A0A0A', padding: '48px 80px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 700, color: 'white' }}>
            About Mugo<span style={{ color: '#D4A017' }}>Bus</span>
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', marginTop: '10px', maxWidth: '560px', lineHeight: 1.6 }}>
            MugoBus makes it simple to book bus tickets across Ethiopia, without queuing at the station.
          </p>
        </div>
      </div>

      <div className="page-pad" style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 80px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1a1a1a', marginBottom: '16px' }}>
          How it <span style={{ color: '#C0392B' }}>works</span>
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '40px' }}>
          {steps.map((s) => (
            <div key={s.n} style={{ background: 'white', borderRadius: '16px', border: '1px solid #EEEEEE', padding: '22px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#C0392B', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', marginBottom: '12px' }}>
                {s.n}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a', marginBottom: '6px' }}>{s.title}</div>
              <div style={{ fontSize: '14px', color: '#777', lineHeight: 1.5 }}>{s.text}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '40px' }}>
          <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #EEEEEE', padding: '24px' }}>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a', marginBottom: '8px' }}>For passengers</h3>
            <p style={{ fontSize: '14px', color: '#777', lineHeight: 1.6 }}>
              See real seat availability, choose exactly where you will board, and keep your ticket on your phone.
            </p>
          </div>
          <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #EEEEEE', padding: '24px' }}>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a', marginBottom: '8px' }}>For bus operators</h3>
            <p style={{ fontSize: '14px', color: '#777', lineHeight: 1.6 }}>
              Manage your buses, trips, pickup points and bookings from one dashboard, and see who is boarding where.
            </p>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <Link href="/routes" style={{ display: 'inline-block', background: '#C0392B', color: 'white', textDecoration: 'none', padding: '14px 32px', borderRadius: '12px', fontSize: '15px', fontWeight: 700 }}>
            Browse routes
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  )
}
