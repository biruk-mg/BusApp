'use client'
export const dynamic = 'force-dynamic'


import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Navbar from '@/components/Navbar'
import { Clock, MapPin, Users, ArrowRight, Bus } from 'lucide-react'
import { formatTime, formatDuration, formatPrice } from '@bus/utils'

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

export default function SearchPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const fromCity = searchParams.get('fromCity') || ''
  const toCity = searchParams.get('toCity') || ''
  const date = searchParams.get('date') || ''
  const passengers = Number(searchParams.get('passengers')) || 1

  const [schedules, setSchedules] = useState<ScheduleResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true)
        setError('')
        const res = await api.get('/schedules/search', { params: { fromCity, toCity, date } })
        setSchedules(res.data.data.schedules)
      } catch {
        setError('No buses found for this route and date.')
      } finally {
        setLoading(false)
      }
    }
    if (fromCity && toCity && date) fetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCity, toCity, date])

  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8' }}>
      <Navbar />

      {/* Dark Header */}
      <div style={{ background: '#1A0A0A', padding: '32px 80px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <MapPin size={16} color="#C0392B" />
            <span style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>{fromCity}</span>
            <ArrowRight size={20} color="#D4A017" />
            <span style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>{toCity}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{date}</span>
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Users size={12} /> {passengers} passenger{passengers > 1 ? 's' : ''}
            </span>
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
              {schedules.length} bus{schedules.length !== 1 ? 'es' : ''} found
            </span>
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 80px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <Bus size={40} color="#E0E0E0" style={{ display: 'block', margin: '0 auto 12px' }} />
            <p style={{ color: '#999', fontSize: '14px' }}>Searching for buses...</p>
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
              Search Again
            </button>
          </div>
        )}

        {!loading && !error && schedules.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <p style={{ color: '#999', marginBottom: '20px' }}>No buses available for this date.</p>
            <button
              onClick={() => router.push('/')}
              style={{ background: '#C0392B', color: 'white', border: 'none', padding: '12px 28px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              Try Another Date
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {schedules.map((schedule) => (
            <div
              key={schedule.id}
              style={{ background: 'white', borderRadius: '16px', border: '1px solid #EEEEEE', padding: '28px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              {/* Left - Times */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '32px', marginBottom: '20px' }}>
                  <div>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>
                      {formatTime(schedule.departureTime)}
                    </div>
                    <div style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>{fromCity}</div>
                  </div>

                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <Clock size={12} />
                      {formatDuration(schedule.route.estimatedDurationMin)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ flex: 1, height: '1px', background: '#E5E5E5' }} />
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#C0392B' }} />
                      <div style={{ flex: 1, height: '1px', background: '#E5E5E5' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: '#C0392B', marginTop: '6px', fontWeight: 600 }}>
                      {schedule.bus.busType}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>
                      {formatTime(schedule.arrivalTime)}
                    </div>
                    <div style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>{toCity}</div>
                  </div>
                </div>

                {/* Operator Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '16px', borderTop: '1px solid #F5F5F5' }}>
                  <span style={{ background: '#FEF2F2', color: '#C0392B', fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '20px' }}>
                    {schedule.bus.operator.companyName}
                  </span>
                  <span style={{ fontSize: '12px', color: '#bbb' }}>•</span>
                  <span style={{ fontSize: '12px', color: '#999' }}>{schedule.bus.plateNumber}</span>
                  <span style={{ fontSize: '12px', color: '#bbb' }}>•</span>
                  <span style={{ fontSize: '12px', color: '#999' }}>{schedule.bus.totalSeats} seats total</span>
                </div>
              </div>

              {/* Right - Price */}
              <div style={{ paddingLeft: '32px', borderLeft: '1px solid #F0F0F0', marginLeft: '32px', textAlign: 'right', minWidth: '160px' }}>
                <div style={{ fontSize: '30px', fontWeight: 700, color: '#C0392B', marginBottom: '4px' }}>
                  {formatPrice(schedule.price)}
                </div>
                <div style={{ fontSize: '12px', color: '#999', marginBottom: '16px' }}>
                  {schedule.availableSeats} seats left
                </div>
                <button
                  onClick={() => router.push(`/book/${schedule.id}?passengers=${passengers}`)}
                  style={{ background: '#C0392B', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', width: '100%' }}
                >
                  Book Now
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}