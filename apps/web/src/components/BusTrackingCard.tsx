'use client'

import Link from 'next/link'
import { usePassengerTracking } from '@/hooks/usePassengerTracking'
import { Radio, MapPin, Map as MapIcon } from 'lucide-react'
import { PassengerTone, passengerView } from '@/lib/tripTracking'

const REFRESH_MS = 20_000

const TONES: Record<PassengerTone, { bg: string; border: string; color: string }> = {
  live: { bg: '#F0FFF4', border: '#BBF7D0', color: '#166534' },
  old: { bg: '#FFFBEB', border: '#FDE68A', color: '#92400E' },
  wait: { bg: '#F7F7F7', border: '#E5E5E5', color: '#555' },
  ended: { bg: '#F7F7F7', border: '#E5E5E5', color: '#555' },
}

/**
 * "Where is my bus": for the owner of a paid online ticket. Asks the server every 20 seconds
 * while the page is open and visible, and stops once the trip has ended. Hides itself when the
 * server says this ticket cannot follow a bus. The button opens the live map (/track/...).
 */
export default function BusTrackingCard({ bookingId }: { bookingId: string }) {
  const { tracking, hidden, failed, secondsSinceAnswer } = usePassengerTracking(bookingId, REFRESH_MS)

  if (hidden) return null

  const view = tracking ? passengerView(tracking, secondsSinceAnswer) : null
  const tone = TONES[view?.tone ?? 'wait']
  const buttonStyle = { display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '10px', padding: '10px 16px', fontSize: '14px', fontWeight: 600, textDecoration: 'none' } as const

  return (
    <div style={{ background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: '16px', padding: '16px 18px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Radio size={18} color={tone.color} style={{ flexShrink: 0 }} />
        <div style={{ fontSize: '15px', fontWeight: 700, color: tone.color }}>{view ? view.headline : 'Looking for your bus...'}</div>
      </div>
      {view?.etaLine && <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a', marginTop: '8px' }}>{view.etaLine}</div>}
      {view?.detail && <div style={{ fontSize: '13px', color: tone.color, marginTop: '6px', lineHeight: 1.5 }}>{view.detail}</div>}
      {failed && <div style={{ fontSize: '12px', color: '#92400E', marginTop: '6px' }}>Could not refresh. Trying again...</div>}
      {tracking && tracking.state !== 'ENDED' && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
          <Link href={`/track/${bookingId}`} style={{ ...buttonStyle, background: '#C0392B', color: 'white' }}>
            <MapIcon size={16} /> Track on the map
          </Link>
          {view?.mapsUrl && (
            <a href={view.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ ...buttonStyle, background: 'white', color: '#444', border: '1px solid #DDD' }}>
              <MapPin size={16} /> Google Maps
            </a>
          )}
        </div>
      )}
    </div>
  )
}
