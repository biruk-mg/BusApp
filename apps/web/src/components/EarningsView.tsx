'use client'

import { EarningsPage, PAYOUT_METHOD_LABEL, PayoutRow } from '@/lib/admin'
import { formatDate, formatPrice, formatTime } from '@bus/utils'

const card: React.CSSProperties = { background: 'white', border: '1px solid #F0F0F0', borderRadius: '16px', padding: '18px 20px' }
const small: React.CSSProperties = { fontSize: '12px', color: '#999', marginTop: '4px', lineHeight: 1.5 }

function Stat({ label, value, note, color }: { label: string; value: string; note?: string; color?: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: '12px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '6px', color: color ?? '#1a1a1a' }}>{value}</div>
      {note && <div style={small}>{note}</div>}
    </div>
  )
}

/**
 * One company's money from ONLINE sales: what is due, what was paid, a statement
 * per trip and the payout history. Shown to the platform admin and, read-only, to
 * the company's own managers.
 */
export default function EarningsView({
  data, audience, onVoid,
}: {
  data: EarningsPage
  audience: 'admin' | 'operator'
  onVoid?: (payout: PayoutRow) => void
}) {
  const s = data.summary
  const rate = data.company.commissionPercent
  const operator = audience === 'operator'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
        <Stat
          label={operator ? 'Owed to you now' : 'Due now'}
          value={formatPrice(s.due)}
          color={s.due > 0 ? '#2E8B57' : '#1a1a1a'}
          note="Online sales from trips that have already left, after the platform's share, minus what was already paid."
        />
        <Stat label="Paid so far" value={formatPrice(s.paid)} />
        <Stat label="Waiting for the trip" value={formatPrice(s.pending)} note="From trips that have not left yet. It becomes payable after departure." />
        <Stat label="Online sales" value={formatPrice(s.gross)} note={`${s.tickets} paid ticket${s.tickets === 1 ? '' : 's'}`} />
        <Stat label={`Platform share (${rate}%)`} value={formatPrice(s.commission)} note="Each sale keeps the rate it was made at." />
      </div>

      {s.overpaid > 0 && (
        <div style={{ background: '#FFF4E5', border: '1px solid #F0D58C', color: '#8A5A00', borderRadius: '12px', padding: '12px 16px', fontSize: '13px', lineHeight: 1.6 }}>
          {operator
            ? `You have been paid ${formatPrice(s.overpaid)} more than you have earned so far (for example after a refunded ticket). It will be taken off your next payout.`
            : `This company has been paid ${formatPrice(s.overpaid)} more than it has earned (for example after a refund). Nothing can be paid out until new sales cover it.`}
        </div>
      )}

      {operator && (
        <p style={{ fontSize: '12px', color: '#999', lineHeight: 1.6, margin: 0 }}>
          This page covers online sales only. Tickets you sell at the counter are paid to you directly, so they are not here.
        </p>
      )}

      <section>
        <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '10px' }}>Payouts</h2>
        {data.payouts.length === 0 ? (
          <p style={{ color: '#999', fontSize: '13px' }}>No payouts yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.payouts.map((p) => (
              <div key={p.id} style={{ ...card, padding: '12px 16px', opacity: p.voided ? 0.55 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, textDecoration: p.voided ? 'line-through' : 'none' }}>{formatPrice(p.amount)}</div>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                      {PAYOUT_METHOD_LABEL[p.method]}{p.reference ? ` · ${p.reference}` : ''} · {formatDate(p.paidAt)}
                    </div>
                    {p.note && <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{p.note}</div>}
                    {p.voided && <div style={{ fontSize: '12px', color: '#C0392B', marginTop: '2px' }}>Cancelled{p.voidReason ? `: ${p.voidReason}` : ''}</div>}
                  </div>
                  {onVoid && !p.voided && (
                    <button onClick={() => onVoid(p)} style={{ background: '#FFF5F5', color: '#C0392B', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      Cancel this payout
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '10px' }}>Statement by trip</h2>
        {data.trips.length === 0 ? (
          <p style={{ color: '#999', fontSize: '13px' }}>No paid online tickets yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.trips.map((t) => (
              <div key={t.scheduleId} style={{ ...card, padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{t.fromCity} → {t.toCity}</div>
                    <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                      {formatDate(t.departureTime)} at {formatTime(t.departureTime)} · {t.tickets} ticket{t.tickets === 1 ? '' : 's'}, {t.seats} seat{t.seats === 1 ? '' : 's'}
                      {!t.departed && ' · not left yet'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: '#666', lineHeight: 1.6 }}>
                    <div>Sales {formatPrice(t.gross)}</div>
                    <div>Platform share −{formatPrice(t.commission)}</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a1a' }}>{formatPrice(t.net)}</div>
                  </div>
                </div>
              </div>
            ))}
            {data.tripsTruncated && <p style={{ fontSize: '12px', color: '#999' }}>Only the latest 100 trips are listed. The totals above include all of them.</p>}
          </div>
        )}
      </section>
    </div>
  )
}
