'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import OffersBanner, { OfferBanner } from '@/components/OffersBanner'
import { api } from '@/lib/api'
import { SITE } from '@/lib/site'
import { useI18n } from '@/i18n/LanguageProvider'
import { addisDateKey } from '@/i18n/format'
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

const CARD_COLORS = [
  'linear-gradient(135deg, #C0392B, #8E2318)',
  'linear-gradient(135deg, #2E8B57, #1E5C3A)',
  'linear-gradient(135deg, #D4A017, #9A7410)',
  'linear-gradient(135deg, #34495E, #1F2D3A)',
]

export default function HomePage() {
  const router = useRouter()
  const { t, tn, locale, city, price, duration, next, ethiopianDate } = useI18n()
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

  const today = addisDateKey(new Date())

  // City lists come from the routes we really have: "From" lists the cities a
  // bus leaves from, and "To" lists only the cities reachable from that city.
  // The values (and the search links) stay the English names; only the shown
  // names are translated, and they are sorted the way the shown names read.
  const routes = home?.routes ?? []
  const byShownName = (a: string, b: string) => city(a).localeCompare(city(b), locale === 'en' ? undefined : locale)
  const fromCities = Array.from(new Set(routes.map((r) => r.fromCity))).sort(byShownName)
  const toCities = Array.from(new Set(routes.filter((r) => r.fromCity === fromCity).map((r) => r.toCity))).sort(byShownName)

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
        { num: home.stats.routes, label: t('home.stat.routes') },
        { num: home.stats.companies, label: t('home.stat.companies') },
        { num: home.stats.upcomingTrips, label: t('home.stat.trips') },
      ].filter((s) => s.num > 0)
    : []

  const steps = [
    { n: '1', title: t('home.step1.title'), text: t('home.step1.text') },
    { n: '2', title: t('home.step2.title'), text: t('home.step2.text') },
    { n: '3', title: t('home.step3.title'), text: t('home.step3.text') },
  ]

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
              <span style={{ fontSize: '12px', color: '#C0392B', fontWeight: 500 }}>{t('home.badge')}</span>
            </div>

            <h1 className="hero-title" style={{ fontSize: '48px', fontWeight: 700, lineHeight: 1.15, color: '#1a1a1a', marginBottom: '16px' }}>
              {t('home.title.line1')}<br />
              {t('home.title.line2')}{' '}
              <span style={{ color: '#C0392B' }}>{t('home.title.accent')}</span>
            </h1>

            <p style={{ fontSize: '16px', color: '#666', lineHeight: 1.7, marginBottom: '32px', maxWidth: '420px' }}>
              {t('home.subtitle')}
            </p>

            {/* Search */}
            <form onSubmit={handleSearch}>
              <div style={{ background: '#F8F8F8', border: '1px solid #E5E5E5', borderRadius: '16px', padding: '20px', marginBottom: '32px' }}>
                <div className="search-grid">
                  <div>
                    <label style={labelStyle}>{t('home.from')}</label>
                    <select value={fromCity} onChange={(e) => handleFromChange(e.target.value)} required disabled={!home} style={fieldStyle}>
                      <option value="">{!home ? (loadError ? t('home.cityLoadFailed') : t('home.loadingCities')) : t('home.selectCity')}</option>
                      {fromCities.map((c) => <option key={c} value={c}>{city(c)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>{t('home.to')}</label>
                    <select value={toCity} onChange={(e) => setToCity(e.target.value)} required disabled={!fromCity} style={fieldStyle}>
                      <option value="">{fromCity ? t('home.selectCity') : t('home.chooseFromFirst')}</option>
                      {toCities.map((c) => <option key={c} value={c}>{city(c)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>{t('home.date')}</label>
                    <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} required style={fieldStyle} />
                    {locale === 'am' && date && (
                      <div style={{ fontSize: '11px', color: '#999', marginTop: '6px' }}>
                        {t('home.dateHint', { date: ethiopianDate(`${date}T12:00:00+03:00`) })}
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>{t('home.passengers')}</label>
                    <select value={passengers} onChange={(e) => setPassengers(Number(e.target.value))} style={fieldStyle}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{tn('home.passengerCount', n)}</option>)}
                    </select>
                  </div>
                </div>
                {loadError && (
                  <div style={{ fontSize: '12px', color: '#C0392B', marginBottom: '12px' }}>
                    {t('home.cityLoadError')}{' '}
                    <button type="button" onClick={loadHome} style={{ background: 'none', border: 'none', color: '#C0392B', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', padding: 0 }}>{t('common.tryAgain')}</button>
                  </div>
                )}
                {home && routes.length === 0 && (
                  <div style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>{t('home.noRoutes')}</div>
                )}
                <button type="submit" disabled={!home || routes.length === 0}
                  style={{ width: '100%', background: '#C0392B', color: 'white', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: !home || routes.length === 0 ? 0.6 : 1 }}>
                  {t('home.search')} <ArrowRight size={16} />
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
              <img src="https://images.unsplash.com/photo-1580746738099-b2d5b1b0c1a8?w=600&q=80" alt={city('Addis Ababa')}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px' }}>
                {city('Addis Ababa')}
              </div>
            </div>
            <div style={{ borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
              <img src="https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=400&q=80" alt={city('Hawassa')}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: '8px', left: '10px', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px' }}>
                {city('Hawassa')}
              </div>
            </div>
            <div style={{ borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
              <img src="https://images.unsplash.com/photo-1489749798305-4fea3ae63d43?w=400&q=80" alt={city('Bahir Dar')}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: '8px', left: '10px', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px' }}>
                {city('Bahir Dar')}
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
              <div style={{ fontSize: '12px', color: '#C0392B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>{t('home.explore')}</div>
              <h2 style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a1a' }}>{t('home.popular.a')} <span style={{ color: '#C0392B' }}>{t('home.popular.b')}</span></h2>
            </div>
            <Link href="/routes" style={{ fontSize: '13px', color: '#666', border: '1px solid #E0E0E0', padding: '8px 18px', borderRadius: '8px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              {t('home.viewAll')}
            </Link>
          </div>

          {!home ? (
            <div style={{ color: '#999', fontSize: '14px', padding: '24px 0' }}>{loadError ? t('home.routesFailed') : t('home.loadingRoutes')}</div>
          ) : home.popular.length === 0 ? (
            <div style={{ border: '1px dashed #E0E0E0', borderRadius: '16px', padding: '36px 20px', textAlign: 'center', color: '#999', fontSize: '14px', lineHeight: 1.6 }}>
              {t('home.noPopular')}
            </div>
          ) : (
            <div className="routes-grid">
              {home.popular.map((route, i) => (
                <Link
                  key={`${route.fromCity}-${route.toCity}`}
                  className="route-card"
                  href={`/search?fromCity=${encodeURIComponent(route.fromCity)}&toCity=${encodeURIComponent(route.toCity)}&date=${addisDateKey(route.nextDeparture)}&passengers=1`}
                >
                  <div style={{ height: '110px', background: CARD_COLORS[i % CARD_COLORS.length], position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px', textAlign: 'center' }}>
                    <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255,255,255,0.95)', fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', color: '#1a1a1a' }}>
                      {tn('home.trips', route.tripCount)}
                    </div>
                    <div style={{ color: 'white', fontSize: '17px', fontWeight: 700, lineHeight: 1.4 }}>
                      {city(route.fromCity)}<br />
                      <ArrowRight size={14} style={{ verticalAlign: 'middle', opacity: 0.8 }} /> {city(route.toCity)}
                    </div>
                  </div>
                  <div style={{ padding: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#C0392B' }}>
                        <span style={{ fontSize: '11px', color: '#999', fontWeight: 400 }}>{t('home.fromPrice')} </span>{price(route.minPrice)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#999' }}>{duration(route.durationMin)}</div>
                    </div>
                    <div style={{ fontSize: '12px', color: '#777', lineHeight: 1.6 }}>
                      {tn('home.companies', route.operatorCount)}<br />
                      {t('home.next', { when: next(route.nextDeparture) })}
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
              <div style={{ fontSize: '12px', color: '#C0392B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>{t('home.why.eyebrow')}</div>
              <h2 style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a1a' }}>{t('home.why.a')} <span style={{ color: '#C0392B' }}>{t('home.why.b')}</span></h2>
            </div>
            <div className="why-grid">
              {[
                { icon: <CheckCircle size={22} />, title: t('home.why1.title'), desc: t('home.why1.desc', { name: SITE.name }) },
                { icon: <Shield size={22} />, title: t('home.why2.title'), desc: t('home.why2.desc') },
                { icon: <Bus size={22} />, title: t('home.why3.title'), desc: t('home.why3.desc') },
                { icon: <Ticket size={22} />, title: t('home.why4.title'), desc: t('home.why4.desc') },
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
            <div style={{ fontSize: '12px', color: '#C0392B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>{t('home.how.eyebrow')}</div>
            <h2 style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a1a' }}>{t('home.how.a')} <span style={{ color: '#C0392B' }}>{t('home.how.b')}</span></h2>
          </div>
          <div className="how-grid">
            {steps.map((s) => (
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
            <Link href="/help" style={{ color: '#C0392B', fontWeight: 600, textDecoration: 'none' }}>{t('home.helpLink')}</Link>
          </div>
        </div>

        {/* CTA */}
        <section style={{ background: '#1A0A0A', padding: 'clamp(48px, 8vw, 80px) clamp(20px, 6vw, 80px)', textAlign: 'center' }}>
          <h2 className="cta-title" style={{ fontSize: '40px', fontWeight: 700, color: 'white', marginBottom: '16px', lineHeight: 1.3 }}>
            {t('home.cta.a')}<br />
            <span style={{ color: '#D4A017' }}>{t('home.cta.b')}</span>
          </h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)', marginBottom: '36px' }}>
            {t('home.cta.sub')}
          </p>
          <div className="cta-buttons">
            <button onClick={() => router.push('/search')}
              style={{ background: '#C0392B', color: 'white', border: 'none', padding: '14px 32px', borderRadius: '10px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {t('nav.bookATrip')} <ArrowRight size={16} />
            </button>
            <Link href="/routes" style={{ background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.3)', padding: '14px 32px', borderRadius: '10px', fontSize: '15px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={16} /> {t('home.viewAll')}
            </Link>
          </div>
          <div className="cta-trust">
            {[t('home.trust1'), t('home.trust2'), t('home.trust3')].map((label) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#D4A017' }} />
                {label}
              </div>
            ))}
          </div>
        </section>

        <Footer />
      </div>
    </>
  )
}
