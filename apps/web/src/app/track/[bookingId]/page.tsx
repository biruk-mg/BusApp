'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import Navbar from '@/components/Navbar'
import { usePassengerTracking } from '@/hooks/usePassengerTracking'
import { passengerView } from '@/lib/tripTracking'
import { ArrowLeft, Radio, MapPin, Clock } from 'lucide-react'

// Leaflet needs the browser, so the map is loaded there only
const LiveBusMap = dynamic(() => import('@/components/LiveBusMap'), {
  ssr: false,
  loading: () => <div style={{ height: '320px', borderRadius: '16px', background: '#EDEDED' }} />,
})

const REFRESH_MS = 10_000

const TONES = {
  live: { bg: '#F0FFF4', border: '#BBF7D0', color: '#166534' },
  old: { bg: '#FFFBEB', border: '#FDE68A', color: '#92400E' },
  wait: { bg: '#F7F7F7', border: '#E5E5E5', color: '#555' },
  ended: { bg: '#F7F7F7', border: '#E5E5E5', color: '#555' },
} as const

/** The live map for one booking: the bus, the passenger's pickup point, and the minutes to it. */
export default function TrackBusPage() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const { tracking, hidden, failed, secondsSinceAnswer } = usePassengerTracking(bookingId, REFRESH_MS)

  const view = tracking ? passengerView(tracking, secondsSinceAnswer) : null
  const tone = TONES[view?.tone ?? 'wait']
  const bus = tracking?.position ?? null
  const stale = view?.tone === 'old'

  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8' }}>
      <Navbar />
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '28px 20px 48px' }}>
        <Link href={`/bookings/${bookingId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#666', textDecoration: 'none', marginBottom: '16px' }}>
          <ArrowLeft size={16} /> My ticket
        </Link>

        {hidden ? (
          <div style={{ background: 'white', border: '1px solid #E5E5E5', borderRadius: '16px', padding: '24px', fontSize: '15px', color: '#555', lineHeight: 1.6 }}>
            This ticket cannot follow a bus. You can follow the bus of a paid online ticket, from 12 hours before the trip until a day after it.
          </div>
        ) : (
          <>
            <div style={{ background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: '16px', padding: '16px 18px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Radio size={18} color={tone.color} style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '16px', fontWeight: 700, color: tone.color }}>{view ? view.headline : 'Looking for your bus...'}</div>
              </div>
              {view?.etaLine && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '22px', fontWeight: 800, color: '#1a1a1a', lineHeight: 1.25 }}>
                  <Clock size={22} color="#C0392B" style={{ flexShrink: 0 }} /> {view.etaLine}
                </div>
              )}
              {view?.etaNote && <div style={{ fontSize: '12px', color: '#666', marginTop: '6px', lineHeight: 1.5 }}>{view.etaNote}</div>}
              {view?.detail && <div style={{ fontSize: '13px', color: tone.color, marginTop: '10px', lineHeight: 1.5 }}>{view.detail}</div>}
              {tracking?.state === 'LIVE' && !tracking.pickup && (
                <div style={{ fontSize: '12px', color: '#666', marginTop: '8px', lineHeight: 1.5 }}>
                  Minutes to your pickup point are not shown: this pickup point has no map position yet.
                </div>
              )}
              {failed && <div style={{ fontSize: '12px', color: '#92400E', marginTop: '8px' }}>Could not refresh. Trying again...</div>}
            </div>

            {bus ? (
              <LiveBusMap
                bus={{ lat: bus.lat, lng: bus.lng }}
                pickup={tracking?.pickup ?? null}
                stale={stale}
              />
            ) : (
              tracking?.state !== 'ENDED' &&
              tracking?.pickup && (
                <LiveBusMap bus={null} pickup={tracking.pickup} stale={false} />
              )
            )}

            {view?.mapsUrl && (
              <a
                href={view.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '14px', fontSize: '13px', color: '#666', textDecoration: 'underline' }}
              >
                <MapPin size={14} /> Open the bus position in Google Maps
              </a>
            )}

            <p style={{ fontSize: '12px', color: '#999', marginTop: '14px', lineHeight: 1.6 }}>
              The position comes from the phone of the ticket checker on the bus and refreshes about every 20 seconds.
              Minutes are an estimate. If the bus is in a place with no signal, the map shows its last known position.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
