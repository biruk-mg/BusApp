'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { api } from '@/lib/api'
import { formatDate, formatTime, formatPrice } from '@bus/utils'
import { Printer } from 'lucide-react'

interface Ticket {
  code: string
  status: 'VALID' | 'VOIDED'
  passengerName: string | null
  seatNumbers: string[]
  totalPrice: number
  companyName: string
  plateNumber: string
  busType: string
  fromCity: string
  toCity: string
  departureTime: string
  arrivalTime: string
  pickupPoint: { name: string; offsetMin: number } | null
  dropoffPoint: { name: string } | null
  // One entry per seat, each with their own stops. Empty for older tickets.
  passengers?: { seatNumber: string; name: string; pickupPoint: { name: string; offsetMin: number } | null; dropoffPoint: { name: string } | null }[]
  qrCode: string
}

function TicketView() {
  const { code } = useParams<{ code: string }>()
  const search = useSearchParams()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/tickets/${code}`)
      .then((res) => setTicket(res.data.data.ticket))
      .catch(() => setError('Ticket not found. Please check the code.'))
  }, [code])

  // Opened from the counter's Print button
  useEffect(() => {
    if (ticket && search.get('print') === '1') setTimeout(() => window.print(), 400)
  }, [ticket, search])

  if (error) return <p style={{ textAlign: 'center', padding: '80px 20px', color: '#999' }}>{error}</p>
  if (!ticket) return <p style={{ textAlign: 'center', padding: '80px 20px', color: '#999' }}>Loading...</p>

  const valid = ticket.status === 'VALID'
  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '10px 0', borderTop: '1px solid #F2F2F2', fontSize: '14px' }}>
      <span style={{ color: '#999' }}>{k}</span>
      <span style={{ fontWeight: 600, color: '#1a1a1a', textAlign: 'right' }}>{v}</span>
    </div>
  )

  const people = ticket.passengers ?? []

  return (
    <div style={{ maxWidth: '420px', margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ background: valid ? '#1A0A0A' : '#7F1D1D', padding: '18px 20px', color: 'white' }}>
          <div style={{ fontSize: '12px', color: '#D4A017' }}>{ticket.companyName}</div>
          <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '2px' }}>{ticket.fromCity} → {ticket.toCity}</div>
          <div style={{ fontSize: '13px', opacity: 0.7, marginTop: '4px' }}>
            {formatDate(ticket.departureTime)} · {formatTime(ticket.departureTime)}
          </div>
        </div>
        {!valid && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '12px 20px', fontSize: '14px', fontWeight: 700, textAlign: 'center' }}>
            THIS TICKET HAS BEEN CANCELLED. DO NOT ACCEPT IT.
          </div>
        )}
        <div style={{ padding: '20px', textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ticket.qrCode} alt="Ticket QR code" width={190} height={190} style={{ margin: '0 auto', opacity: valid ? 1 : 0.25 }} />
          <div style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '4px', margin: '6px 0 14px' }}>{ticket.code}</div>
          <div style={{ textAlign: 'left' }}>
            {people.length > 0 ? people.map((p) => (
              <div key={p.seatNumber} style={{ borderBottom: '1px solid #F0F0F0', paddingBottom: '4px', marginBottom: '4px' }}>
                {row(`Seat ${p.seatNumber}`, p.name)}
                {p.pickupPoint && row('Pickup', `${p.pickupPoint.name} (~${formatTime(new Date(new Date(ticket.departureTime).getTime() + p.pickupPoint.offsetMin * 60000).toISOString())})`)}
                {p.dropoffPoint && row('Drop-off', p.dropoffPoint.name)}
              </div>
            )) : (
              <>
                {row('Passenger', ticket.passengerName ?? '—')}
                {row(ticket.seatNumbers.length > 1 ? 'Seats' : 'Seat', ticket.seatNumbers.join(', '))}
                {ticket.pickupPoint && row('Pickup', `${ticket.pickupPoint.name} (~${formatTime(new Date(new Date(ticket.departureTime).getTime() + ticket.pickupPoint.offsetMin * 60000).toISOString())})`)}
                {ticket.dropoffPoint && row('Drop-off', ticket.dropoffPoint.name)}
              </>
            )}
            {row('Bus', `${ticket.plateNumber} · ${ticket.busType}`)}
            {row('Arrives', formatTime(ticket.arrivalTime))}
            {row('Paid', formatPrice(ticket.totalPrice))}
          </div>
          <p style={{ fontSize: '12px', color: '#999', marginTop: '14px' }}>Please be at your pickup point 10–15 minutes early.</p>
        </div>
      </div>
      <button className="no-print" onClick={() => window.print()}
        style={{ width: '100%', marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'white', border: '1px solid #E5E5E5', borderRadius: '12px', padding: '14px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
        <Printer size={16} /> Print ticket
      </button>
      <style>{`@media print { .no-print { display: none !important; } body { background: white !important; } }`}</style>
    </div>
  )
}

export default function TicketPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8' }}>
      <Suspense fallback={<p style={{ textAlign: 'center', padding: '80px 20px', color: '#999' }}>Loading...</p>}>
        <TicketView />
      </Suspense>
    </div>
  )
}
