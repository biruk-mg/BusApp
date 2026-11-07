'use client'

import { formatDate, formatTime, formatPrice } from '@bus/utils'
import { Ban } from 'lucide-react'
import { CounterSale, METHOD_LABEL } from '@/lib/counter'

/** A list of counter sales, with a Void button where the person is allowed to void. */
export default function CounterSalesList({
  sales, onVoid, showSeller = false,
}: {
  sales: CounterSale[]
  onVoid: (sale: CounterSale) => void
  showSeller?: boolean
}) {
  if (sales.length === 0) {
    return <p style={{ color: '#999', fontSize: '14px', padding: '24px 0', textAlign: 'center' }}>No sales on this day.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {sales.map((s) => {
        const voided = s.status === 'CANCELLED'
        return (
          <div key={s.id} style={{ background: 'white', border: '1px solid #EEEEEE', borderRadius: '14px', padding: '14px 16px', opacity: voided ? 0.6 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a1a' }}>
                  {s.passengerName} <span style={{ fontWeight: 400, color: '#999', fontSize: '12px' }}>{s.passengerPhone}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '3px' }}>
                  {s.schedule.route.fromCity} → {s.schedule.route.toCity} · {formatDate(s.schedule.departureTime)} {formatTime(s.schedule.departureTime)}
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                  Seat{s.seatNumbers.length > 1 ? 's' : ''} {s.seatNumbers.join(', ')}
                  {s.pickupPoint ? ` · Pickup: ${s.pickupPoint.name}` : ''}
                </div>
                <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                  {formatTime(s.createdAt)} · {METHOD_LABEL[s.payment?.method ?? ''] ?? '—'}
                  {s.payment?.reference ? ` · ${s.payment.reference}` : s.payment?.method !== 'CASH' && voided ? ' · receipt released' : ''}
                  {showSeller && s.soldByStaff ? ` · sold by ${s.soldByStaff.user.name}` : ''}
                  {s.ticketCode ? ` · ${s.ticketCode}` : ''}
                </div>
                {voided && (
                  <div style={{ fontSize: '12px', color: '#C0392B', marginTop: '6px' }}>
                    Voided{s.voidedByStaff ? ` by ${s.voidedByStaff.user.name}` : ''}{s.voidReason ? `: ${s.voidReason}` : ''}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: voided ? '#999' : '#C0392B', textDecoration: voided ? 'line-through' : 'none' }}>
                  {formatPrice(s.totalPrice)}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {s.ticketCode && !voided && (
                    <a href={`/ticket/${s.ticketCode}`} target="_blank" rel="noreferrer"
                       style={{ fontSize: '12px', fontWeight: 600, color: '#555', background: '#F5F5F5', padding: '6px 10px', borderRadius: '8px', textDecoration: 'none' }}>
                      Ticket
                    </a>
                  )}
                  {s.canVoid && (
                    <button onClick={() => onVoid(s)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: '#C0392B', background: '#FFF5F5', border: 'none', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer' }}>
                      <Ban size={12} /> Void
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
