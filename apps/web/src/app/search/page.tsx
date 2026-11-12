'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import Navbar from '@/components/Navbar'
import { Clock, MapPin, Users, ArrowRight, Bus } from 'lucide-react'
import { useI18n } from '@/i18n/LanguageProvider'

interface ScheduleResult {
  id: string
  price: number
  departureTime: string
  arrivalTime: string
  availableSeats: number
  totalSeats: number
  route: { fromCity: string; toCity: string; estimatedDurationMin: number }
  bus: { plateNumber: string; totalSeats: number; busType: string; operator: { companyName: string } }
}

function SearchResults() {
  const { t, tn, locale, city, time, duration, price, dateLong, busType } = useI18n()
  const searchParams = useSearchParams()
  const router = useRouter()
  const fromCity = searchParams.get('fromCity') || ''
  const toCity = searchParams.get('toCity') || ''
  const date = searchParams.get('date') || ''
  const passengers = Number(searchParams.get('passengers')) || 1

  const [schedules, setSchedules] = useState<ScheduleResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busTypeFilter, setBusTypeFilter] = useState('ALL')
  const [operatorFilter, setOperatorFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState<'time' | 'price'>('time')
  // Which departure is showing for each operator (operator name -> trip id)
  const [picked, setPicked] = useState<Record<string, string>>({})

  const operators = useMemo(
    () => Array.from(new Set(schedules.map((s) => s.bus.operator.companyName))).sort(),
    [schedules]
  )
  const busTypes = useMemo(
    () => Array.from(new Set(schedules.map((s) => s.bus.busType))).sort(),
    [schedules]
  )
  const visible = useMemo(() => {
    const list = schedules.filter(
      (s) =>
        (busTypeFilter === 'ALL' || s.bus.busType === busTypeFilter) &&
        (operatorFilter === 'ALL' || s.bus.operator.companyName === operatorFilter)
    )
    return [...list].sort((a, b) =>
      sortBy === 'price'
        ? a.price - b.price || a.departureTime.localeCompare(b.departureTime)
        : a.departureTime.localeCompare(b.departureTime)
    )
  }, [schedules, busTypeFilter, operatorFilter, sortBy])

  // One group per operator, with its departures in time order.
  // Groups keep the order of the sorted list (earliest or cheapest first).
  const groups = useMemo(() => {
    const byOperator = new Map<string, ScheduleResult[]>()
    for (const s of visible) {
      const key = s.bus.operator.companyName
      byOperator.set(key, [...(byOperator.get(key) ?? []), s])
    }
    return Array.from(byOperator, ([key, trips]) => ({
      key,
      trips: [...trips].sort((a, b) => a.departureTime.localeCompare(b.departureTime)),
    }))
  }, [visible])

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true)
        setError('')
        const res = await api.get('/schedules/search', { params: { fromCity, toCity, date } })
        setSchedules(res.data.data.schedules)
      } catch {
        setError(t('search.noBuses'))
      } finally {
        setLoading(false)
      }
    }
    if (fromCity && toCity && date) fetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCity, toCity, date])

  return (
    <>
      <div className="hero-pad" style={{ background: '#1A0A0A', padding: '32px 80px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div className="route-title" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <MapPin size={16} color="#C0392B" />
            <span style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>{city(fromCity)}</span>
            <ArrowRight size={20} color="#D4A017" />
            <span style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>{city(toCity)}</span>
          </div>
          <div className="route-meta" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{date ? dateLong(`${date}T12:00:00+03:00`) : date}</span>
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Users size={12} /> {tn('search.passenger', passengers)}
            </span>
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
              {tn('search.found', visible.length)}
            </span>
          </div>
        </div>
      </div>

      <div className="page-pad" style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 80px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <Bus size={40} color="#E0E0E0" style={{ display: 'block', margin: '0 auto 12px' }} />
            <p style={{ color: '#999', fontSize: '14px' }}>{t('search.searching')}</p>
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <Bus size={48} color="#E0E0E0" style={{ display: 'block', margin: '0 auto 16px' }} />
            <p style={{ color: '#999', marginBottom: '20px', fontSize: '14px' }}>{error}</p>
            <button
              onClick={() => router.push('/')}
              style={{ background: '#C0392B', color: 'white', border: 'none', padding: '12px 28px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              {t('search.searchAgain')}
            </button>
          </div>
        )}

        {!loading && !error && schedules.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <p style={{ color: '#999', marginBottom: '20px' }}>{t('search.noneThisDate')}</p>
            <button
              onClick={() => router.push('/')}
              style={{ background: '#C0392B', color: 'white', border: 'none', padding: '12px 28px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              {t('search.tryAnotherDate')}
            </button>
          </div>
        )}

        {!loading && !error && schedules.length > 0 && (
          <div className="filter-bar" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <select
              value={busTypeFilter}
              onChange={(e) => setBusTypeFilter(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #E5E5E5', background: 'white', fontSize: '13px' }}
            >
              <option value="ALL">{t('search.allTypes')}</option>
              {busTypes.map((bt) => (
                <option key={bt} value={bt}>{busType(bt)}</option>
              ))}
            </select>
            <select
              value={operatorFilter}
              onChange={(e) => setOperatorFilter(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #E5E5E5', background: 'white', fontSize: '13px' }}
            >
              <option value="ALL">{t('search.allOperators')}</option>
              {operators.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'time' | 'price')}
              style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #E5E5E5', background: 'white', fontSize: '13px' }}
            >
              <option value="time">{t('search.earliest')}</option>
              <option value="price">{t('search.cheapest')}</option>
            </select>
          </div>
        )}

        {!loading && !error && schedules.length > 0 && locale !== 'en' && (
          <p style={{ color: '#999', fontSize: '12px', marginBottom: '12px' }}>{t('common.timeNote')}</p>
        )}

        {!loading && !error && schedules.length > 0 && visible.length === 0 && (
          <p style={{ color: '#999', fontSize: '14px', padding: '20px 0' }}>
            {t('search.noMatch')}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {groups.map((group) => {
            // Show the chosen departure, else the first one that still has seats
            const schedule =
              group.trips.find((trip) => trip.id === picked[group.key]) ??
              group.trips.find((trip) => trip.availableSeats > 0) ??
              group.trips[0]
            return (
            <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {group.trips.length > 1 && (
                <div className="time-strip" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {group.trips.map((trip) => {
                    const current = trip.id === schedule.id
                    const soldOut = trip.availableSeats === 0
                    return (
                      <button
                        type="button"
                        key={trip.id}
                        disabled={soldOut}
                        onClick={() => setPicked((prev) => ({ ...prev, [group.key]: trip.id }))}
                        style={{
                          padding: '10px 14px', borderRadius: '12px', textAlign: 'left',
                          cursor: soldOut ? 'not-allowed' : 'pointer',
                          border: current ? '2px solid #C0392B' : '1px solid #E5E5E5',
                          background: current ? '#FFF5F5' : 'white',
                          opacity: soldOut ? 0.5 : 1,
                        }}
                      >
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a' }}>{time(trip.departureTime)}</div>
                        <div style={{ fontSize: '11px', color: '#999' }}>
                          {soldOut ? t('search.soldOut') : t('search.seatsPrice', { seats: trip.availableSeats, price: price(trip.price) })}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            <div
              className="result-card"
              style={{ background: 'white', borderRadius: '16px', border: '1px solid #EEEEEE', padding: '28px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div style={{ flex: 1 }}>
                <div className="trip-times" style={{ display: 'flex', alignItems: 'center', gap: '32px', marginBottom: '20px' }}>
                  <div>
                    <div className="trip-time" style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>
                      {time(schedule.departureTime)}
                    </div>
                    <div style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>{city(fromCity)}</div>
                  </div>

                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <Clock size={12} />
                      {duration(schedule.route.estimatedDurationMin)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ flex: 1, height: '1px', background: '#E5E5E5' }} />
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#C0392B' }} />
                      <div style={{ flex: 1, height: '1px', background: '#E5E5E5' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: '#C0392B', marginTop: '6px', fontWeight: 600 }}>
                      {busType(schedule.bus.busType)}
                    </div>
                  </div>

                  <div>
                    <div className="trip-time" style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>
                      {time(schedule.arrivalTime)}
                    </div>
                    <div style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>{city(toCity)}</div>
                  </div>
                </div>

                <div className="trip-meta" style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '16px', borderTop: '1px solid #F5F5F5' }}>
                  <span style={{ background: '#FEF2F2', color: '#C0392B', fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '20px' }}>
                    {schedule.bus.operator.companyName}
                  </span>
                  <span style={{ fontSize: '12px', color: '#bbb' }}>•</span>
                  <span style={{ fontSize: '12px', color: '#999' }}>{schedule.bus.plateNumber}</span>
                  <span style={{ fontSize: '12px', color: '#bbb' }}>•</span>
                  <span style={{ fontSize: '12px', color: '#999' }}>{t('search.seatsTotal', { n: schedule.bus.totalSeats })}</span>
                </div>
              </div>

              <div className="result-price" style={{ paddingLeft: '32px', borderLeft: '1px solid #F0F0F0', marginLeft: '32px', textAlign: 'right', minWidth: '160px' }}>
                <div style={{ fontSize: '30px', fontWeight: 700, color: '#C0392B', marginBottom: '4px' }}>
                  {price(schedule.price)}
                </div>
                <div style={{ fontSize: '12px', color: '#999', marginBottom: '16px' }}>
                  {t('search.seatsLeft', { n: schedule.availableSeats })}
                </div>
                <button
                  onClick={() => router.push(`/book/${schedule.id}?passengers=${passengers}`)}
                  style={{ background: '#C0392B', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', width: '100%' }}
                >
                  {t('search.bookNow')}
                </button>
              </div>
            </div>
            </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

export default function SearchPage() {
  const { t } = useI18n()
  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8' }}>
      <Navbar />
      <Suspense fallback={
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <Bus size={40} color="#E0E0E0" style={{ display: 'block', margin: '0 auto 12px' }} />
          <p style={{ color: '#999' }}>{t('search.preparing')}</p>
        </div>
      }>
        <SearchResults />
      </Suspense>
    </div>
  )
}