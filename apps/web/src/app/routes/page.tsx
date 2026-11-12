'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import Navbar from '@/components/Navbar'
import { useI18n } from '@/i18n/LanguageProvider'
import { addisDateKey } from '@/i18n/format'
import { ArrowRight, Clock, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'

interface RouteItem {
  id: string
  fromCity: string
  toCity: string
  distanceKm: number
  estimatedDurationMin: number
}

interface TripItem {
  routeId: string
  price: number
  departureTime: string
  bus: { operator: { companyName: string } }
}

interface RouteSummary extends RouteItem {
  trips: number
  fromPrice: number | null
  nextDeparture: string | null
  operators: string[]
}

export default function RoutesPage() {
  const { t, tn, city, price, duration } = useI18n()
  const [routes, setRoutes] = useState<RouteSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [routesRes, tripsRes] = await Promise.all([api.get('/routes'), api.get('/schedules')])
        const trips: TripItem[] = tripsRes.data.data.schedules
        const summaries: RouteSummary[] = (routesRes.data.data.routes as RouteItem[]).map((r) => {
          const mine = trips
            .filter((t) => t.routeId === r.id)
            .sort((a, b) => a.departureTime.localeCompare(b.departureTime))
          return {
            ...r,
            trips: mine.length,
            fromPrice: mine.length ? Math.min(...mine.map((t) => t.price)) : null,
            nextDeparture: mine.length ? mine[0].departureTime : null,
            operators: Array.from(new Set(mine.map((t) => t.bus.operator.companyName))),
          }
        })
        // Routes with upcoming trips first, then A to Z
        summaries.sort((a, b) =>
          Number(b.trips > 0) - Number(a.trips > 0) ||
          `${a.fromCity}${a.toCity}`.localeCompare(`${b.fromCity}${b.toCity}`)
        )
        setRoutes(summaries)
      } catch {
        toast.error(t('routes.failed'))
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8' }}>
      <Navbar />

      <div className="hero-pad" style={{ background: '#1A0A0A', padding: '40px 80px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '30px', fontWeight: 700, color: 'white' }}>
            {t('routes.title.a')} <span style={{ color: '#D4A017' }}>{t('routes.title.b')}</span>
          </h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginTop: '6px' }}>
            {t('routes.sub')}
          </p>
        </div>
      </div>

      <div className="page-pad" style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 80px' }}>
        {loading && <div style={{ textAlign: 'center', padding: '60px', color: '#999' }}>{t('routes.loading')}</div>}

        {!loading && routes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: '#999' }}>{t('routes.none')}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '16px' }}>
          {routes.map((r) => {
            const hasTrips = r.trips > 0 && r.nextDeparture
            const href = hasTrips
              ? `/search?fromCity=${encodeURIComponent(r.fromCity)}&toCity=${encodeURIComponent(r.toCity)}&date=${addisDateKey(r.nextDeparture!)}&passengers=1`
              : ''
            return (
              <div key={r.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #EEEEEE', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <MapPin size={14} color="#C0392B" />
                  <span style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a' }}>{city(r.fromCity)}</span>
                  <ArrowRight size={14} color="#D4A017" />
                  <span style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a' }}>{city(r.toCity)}</span>
                </div>

                <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: '#999', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} />{duration(r.estimatedDurationMin)}</span>
                  <span>{t('common.km', { n: Math.round(r.distanceKm) })}</span>
                </div>

                {hasTrips ? (
                  <div>
                    <div style={{ fontSize: '12px', color: '#999' }}>{t('routes.from')}</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: '#C0392B' }}>{price(r.fromPrice!)}</div>
                    <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                      {tn('routes.upcoming', r.trips)}
                      {r.operators.length > 0 && ` · ${r.operators.join(', ')}`}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: '#bbb' }}>{t('routes.noTrips')}</div>
                )}

                {hasTrips ? (
                  <Link href={href} style={{ marginTop: 'auto', background: '#C0392B', color: 'white', textDecoration: 'none', textAlign: 'center', padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: 600 }}>
                    {t('routes.seeTrips')}
                  </Link>
                ) : (
                  <span style={{ marginTop: 'auto', background: '#F0F0F0', color: '#aaa', textAlign: 'center', padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: 600 }}>
                    {t('routes.comingSoon')}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
