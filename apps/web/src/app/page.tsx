'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import OffersBanner, { OfferBanner } from '@/components/OffersBanner'
import { api } from '@/lib/api'
import { ArrowRight, Shield, Ticket, CheckCircle, Bus, MapPin } from 'lucide-react'

interface RoutePair { fromCity: string; toCity: string }
interface PopularRoute {
  fromCity: string
  toCity: string
  durationMin: number
  minPrice: number
  tripCount: number
  operatorCount: number
  nextDeparture: string
}
interface HomeData {
  routes: RoutePair[]
  popular: PopularRoute[]
  stats: { routes: number; companies: number; upcomingTrips: number }
  banners: OfferBanner[]
}

const TZ = 'Africa/Addis_Ababa'
const CARD_COLORS = [
  'linear-gradient(135deg, #C0392B, #8E2318)',
  'linear-gradient(135deg, #2E8B57, #1E5C3A)',
  'linear-gradient(135deg, #D4A017, #9A7410)',
  'linear-gradient(135deg, #34495E, #1F2D3A)',
]

// All dates and times are shown as Addis Ababa time, whatever the phone's time zone
const addisDate = (d: Date | string) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ })

function formatDuration(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function formatNext(iso: string) {
  const time = new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
  const toDay = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  const diff = Math.round((toDay(addisDate(iso)) - toDay(addisDate(new Date()))) / 86400000)
  if (diff <= 0) return `Today, ${time}`
  if (diff === 1) return `Tomorrow, ${time}`
  const day = new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })
  return `${day}, ${time}`
}

const STEPS = [
  { n: '1', title: 'Search', text: 'Choose where you are going and the date, and see the trips available.' },
  { n: '2', title: 'Choose your seat', text: 'Pick your seat on the bus map and the place where you will board.' },
  { n: '3', title: 'Pay and travel', text: 'Pay online and get a ticket with a QR code to show when boarding.' },
]

export default function HomePage() {
  const router = useRouter()
  const [fromCity, setFromCity] = useState('')
  const [toCity, setToCity] = useState('')
  const [date, setDate] = useState('')
  const [passengers, setPassengers] = useState(1)
  const [mounted, setMounted] = useState(false)
  const [home, setHome] = useState<HomeData | null>(null)
  const [loadError, setLoadError] = useState(false)

  const loadHome = useCallback(async () => {
    setLoadError(false)
    try {
      const res = await api.get('/public/home')
      setHome(res.data.data as HomeData)
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => { setMounted(true); loadHome() }, [loadHome])

  const today = addisDate(new Date())

  // City lists come from the routes we really have: "From" lists the cities a
  // bus leaves from, and "To" lists only the cities reachable from that city.
  const routes = home?.routes ?? []
  const fromCities = Array.from(new Set(routes.map((r) => r.fromCity))).sort((a, b) => a.localeCompare(b))
  const toCities = Array.from(new Set(routes.filter((r) => r.fromCity === fromCity).map((r) => r.toCity))).sort((a, b) => a.localeCompare(b))

  const handleFromChange = (value: string) => {
    setFromCity(value)
    if (!routes.some((r) => r.fromCity === value && r.toCity === toCity)) setToCity('')
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fromCity || !toCity || !date) return
    router.push(`/search?fromCity=${encodeURIComponent(fromCity)}&toCity=${encodeURIComponent(toCity)}&date=${date}&passengers=${passengers}`)
  }

  if (!mounted) return null

  const stats = home
    ? [
        { num: home.stats.routes, label: 'Routes' },
        { num: home.stats.companies, label: 'Bus companies' },
        { num: home.stats.upcomingTrips, label: 'Upcoming trips' },
      ].filter((s) => s.num > 0)
    : []

  const fieldStyle = { width: '100%', border: '1px solid #E0E0E0', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', background: '#fff', boxSizing: 'border-box' } as const
  const labelStyle = { display: 'block', fontSize: '11px', color: '#999', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' } as const

  return (
    <>
      <style>{`
        .hero-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 48px;
          padding: 64px 80px 48px;
          align-items: center;
          max-width: 1200px;
          margin: 0 auto;
        }
        .hero-images {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 200px 200px;
          gap: 12px;
        }
        .search-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }
        .hero-stats {
          display: flex;
          gap: 40px;
        }
        .section-padding {
          padding: 64px 80px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .routes-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .why-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-top: 40px;
        }
        .cta-buttons {
          display: flex;
          gap: 12px;
          justify-content: center;
          margin-bottom: 36px;
          flex-wrap: wrap;
        }
        .cta-trust {
          display: flex;
          gap: 28px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .section-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          margin-bottom: 32px;
        }
        .how-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-top: 40px;
        }
        .route-card {
          display: block;
          text-decoration: none;
          color: inherit;
          border: 1px solid #E5E5E5;
          border-radius: 16px;
          overflow: hidden;
          cursor: pointer;
          background: #fff;
          transition: transform 0.2s;
        }
        .route-card:hover {
          transform: translateY(-4px);
        }
        @media (max-width: 1024px) {
          .routes-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .why-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 768px) {
          .how-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .hero-section {
            grid-template-columns: 1fr;
            padding: 32px 20px;
            gap: 32px;
          }
          .hero-images {
            grid-template-rows: 160px 160px;
            gap: 8px;
          }
          .search-grid {
            grid-template-columns: 1fr;
          }
          .hero-stats {
            gap: 24px;
          }
          .section-padding {
            padding: 40px 20px;
          }
          .routes-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
          .why-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
          .section-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }
          .hero-title {
            font-size: 36px !important;
          }
        }
        @media (max-width: 480px) {
          .routes-grid {
            grid-template-columns: 1fr;
          }
          .why-grid {
            grid-template-columns: 1fr;
          }
          .hero-title {
            font-size: 30px !important;
          }
          .cta-title {
            font-size: 28px !important;
          }
        }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#fff' }}>
        <Navbar />

        {/* Hero */}
        <div className="hero-section">
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#FEF9E7', border: '1px solid #F0D060', borderRadius: '20px', padding: '6px 14px', marginBottom: '20px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C0392B' }} />
              <span style={{ fontSize: '12px', color: '#C0392B', fontWeight: 500 }}>Book bus tickets online across Ethiopia</span>
            </div>

            <h1 className="hero-title" style={{ fontSize: '48px', fontWeight: 700, lineHeight: 1.15, color: '#1a1a1a', marginBottom: '16px' }}>
              Travel Across<br />
              Ethiopia with{' '}
              <span style={{ color: '#C0392B' }}>Ease</span>
            </h1>

            <p style={{ fontSize: '16px', color: '#666', lineHeight: 1.7, marginBottom: '32px', maxWidth: '420px' }}>
              Book your bus ticket online — secure payment, instant e-ticket and your choice of seat and pickup point.
            </p>

            {/* Search */}
            <form onSubmit={handleSearch}>
              <div style={{ background: '#F8F8F8', border: '1px solid #E5E5E5', borderRadius: '16px', padding: '20px', marginBottom: '32px' }}>
                <div className="search-grid">
                  <div>
                    <label style={labelStyle}>From</label>
                    <select value={fromCity} onChange={(e) => handleFromChange(e.target.value)} required disabled={!home} style={fieldStyle}>
                      <option value="">{!home ? (loadError ? 'Could not load cities' : 'Loading cities…') : 'Select city'}</option>
                      {fromCities.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>To</label>
                    <select value={toCity} onChange={(e) => setToCity(e.target.value)} required disabled={!fromCity} style={fieldStyle}>
                      <option value="">{fromCity ? 'Select city' : 'Choose where from first'}</option>
                      {toCities.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Date</label>
                    <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} required style={fieldStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Passengers</label>
                    <select value={passengers} onChange={(e) => setPassengers(Number(e.target.value))} style={fieldStyle}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} Passenger{n > 1 ? 's' : ''}</option>)}
                    </select>
                  </div>
                </div>
                {loadError && (
                  <div style={{ fontSize: '12px', color: '#C0392B', marginBottom: '12px' }}>
                    We could not load the cities.{' '}
                    <button type="button" onClick={loadHome} style={{ background: 'none', border: 'none', color: '#C0392B', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', padding: 0 }}>Try again</button>
                  </div>
                )}
                {home && routes.length === 0 && (
                  <div style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>No routes are available yet. Please check back soon.</div>
                )}
                <button type="submit" disabled={!home || routes.length === 0}
                  style={{ width: '100%', background: '#C0392B', color: 'white', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: !home || routes.length === 0 ? 0.6 : 1 }}>
                  Search Buses <ArrowRight size={16} />
                </button>
              </div>
            </form>

            {/* Real numbers from the database */}
            {stats.length > 0 && (
              <div className="hero-stats">
                {stats.map((s) => (
                  <div key={s.label}>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>{s.num}</div>
                    <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hero Images */}
          <div className="hero-images">
            <div style={{ gridRow: 'span 2', borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
              <img src="https://images.unsplash.com/photo-1580746738099-b2d5b1b0c1a8?w=600&q=80" alt="Addis Ababa"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px' }}>
                Addis Ababa
              </div>
            </div>
            <div style={{ borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
              <img src="https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=400&q=80" alt="Hawassa"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: '8px', left: '10px', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px' }}>
                Hawassa
              </div>
            </div>
            <div style={{ borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
              <img src="https://images.unsplash.com/photo-1489749798305-4fea3ae63d43?w=400&q=80" alt="Bahir Dar"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: '8px', left: '10px', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px' }}>
                Bahir Dar
              </div>
            </div>
          </div>
        </div>

        {/* Offers and deals */}
        <OffersBanner banners={home?.banners ?? []} />

        {/* Popular Routes */}
        <div className="section-padding">
          <div className="section-header">
            <div>
              <div style={{ fontSize: '12px', color: '#C0392B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Explore</div>
              <h2 style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a1a' }}>Popular <span style={{ color: '#C0392B' }}>Routes</span></h2>
            </div>
            <Link href="/routes" style={{ fontSize: '13px', color: '#666', border: '1px solid #E0E0E0', padding: '8px 18px', borderRadius: '8px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              View All Routes
            </Link>
          </div>

          {!home ? (
            <div style={{ color: '#999', fontSize: '14px', padding: '24px 0' }}>{loadError ? 'We could not load the routes right now.' : 'Loading routes…'}</div>
          ) : home.popular.length === 0 ? (
            <div style={{ border: '1px dashed #E0E0E0', borderRadius: '16px', padding: '36px 20px', textAlign: 'center', color: '#999', fontSize: '14px', lineHeight: 1.6 }}>
              Trips will appear here as soon as bus companies add them. You can still use the search above.
            </div>
          ) : (
            <div className="routes-grid">
              {home.popular.map((route, i) => (
                <Link
                  key={`${route.fromCity}-${route.toCity}`}
                  className="route-card"
                  href={`/search?fromCity=${encodeURIComponent(route.fromCity)}&toCity=${encodeURIComponent(route.toCity)}&date=${addisDate(route.nextDeparture)}&passengers=1`}
                >
                  <div style={{ height: '110px', background: CARD_COLORS[i % CARD_COLORS.length], position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px', textAlign: 'center' }}>
                    <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255,255,255,0.95)', fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', color: '#1a1a1a' }}>
                      {route.tripCount} trip{route.tripCount === 1 ? '' : 's'}
                    </div>
                    <div style={{ color: 'white', fontSize: '17px', fontWeight: 700, lineHeight: 1.3 }}>
                      {route.fromCity}<br />
                      <span style={{ fontSize: '13px', fontWeight: 500, opacity: 0.8 }}>to</span> {route.toCity}
                    </div>
                  </div>
                  <div style={{ padding: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#C0392B' }}>
                        <span style={{ fontSize: '11px', color: '#999', fontWeight: 400 }}>From </span>ETB {route.minPrice}
                      </div>
                      <div style={{ fontSize: '11px', color: '#999' }}>{formatDuration(route.durationMin)}</div>
                    </div>
                    <div style={{ fontSize: '12px', color: '#777', lineHeight: 1.6 }}>
                      {route.operatorCount} bus compan{route.operatorCount === 1 ? 'y' : 'ies'}<br />
                      Next: {formatNext(route.nextDeparture)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Why Choose Us */}
        <div style={{ background: '#F8F8F8', padding: '64px 80px' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#C0392B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Why choose us</div>
              <h2 style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a1a' }}>Travel with <span style={{ color: '#C0392B' }}>Confidence</span></h2>
            </div>
            <div className="why-grid">
              {[
                { icon: <CheckCircle size={22} />, title: 'Licensed Operators', desc: 'Every bus company on MugoBus is added by our team with its licence details' },
                { icon: <Shield size={22} />, title: 'Secure Payments', desc: 'Pay online through Chapa. We never see or store your card or mobile-money PIN' },
                { icon: <Bus size={22} />, title: 'Your Seat, Your Pickup', desc: 'See the seat map and choose your seat and where you will board' },
                { icon: <Ticket size={22} />, title: 'Instant E-Ticket', desc: 'Get your QR code ticket instantly after booking — no printing needed' },
              ].map((item) => (
                <div key={item.title} style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: '16px', padding: '28px 20px', textAlign: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#C0392B' }}>
                    {item.icon}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', marginBottom: '8px' }}>{item.title}</div>
                  <div style={{ fontSize: '13px', color: '#999', lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="section-padding">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#C0392B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Simple</div>
            <h2 style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a1a' }}>How it <span style={{ color: '#C0392B' }}>works</span></h2>
          </div>
          <div className="how-grid">
            {STEPS.map((s) => (
              <div key={s.n} style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: '16px', padding: '24px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#C0392B', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', marginBottom: '12px' }}>
                  {s.n}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a', marginBottom: '6px' }}>{s.title}</div>
                <div style={{ fontSize: '14px', color: '#777', lineHeight: 1.6 }}>{s.text}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px' }}>
            <Link href="/help" style={{ color: '#C0392B', fontWeight: 600, textDecoration: 'none' }}>Need help? Visit the Help Center →</Link>
          </div>
        </div>

        {/* CTA */}
        <section style={{ background: '#1A0A0A', padding: 'clamp(48px, 8vw, 80px) clamp(20px, 6vw, 80px)', textAlign: 'center' }}>
          <h2 className="cta-title" style={{ fontSize: '40px', fontWeight: 700, color: 'white', marginBottom: '16px', lineHeight: 1.3 }}>
            Ready for Your Next<br />
            <span style={{ color: '#D4A017' }}>Ethiopian Journey?</span>
          </h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)', marginBottom: '36px' }}>
            Start booking today. Travel comfortably across Ethiopia.
          </p>
          <div className="cta-buttons">
            <button onClick={() => router.push('/search')}
              style={{ background: '#C0392B', color: 'white', border: 'none', padding: '14px 32px', borderRadius: '10px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Book a Trip <ArrowRight size={16} />
            </button>
            <Link href="/routes" style={{ background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.3)', padding: '14px 32px', borderRadius: '10px', fontSize: '15px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={16} /> View All Routes
            </Link>
          </div>
          <div className="cta-trust">
            {['Secure online payment', 'Instant e-ticket', 'Choose your seat'].map((t) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#D4A017' }} />
                {t}
              </div>
            ))}
          </div>
        </section>

        <Footer />
      </div>
    </>
  )
}
