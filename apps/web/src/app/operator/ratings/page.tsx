'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { errorOf } from '@/lib/admin'
import { CompanyRatings } from '@/lib/ratings'
import { Stars } from '@/components/Stars'
import { formatDate } from '@bus/utils'
import { Star } from 'lucide-react'
import toast from 'react-hot-toast'

const card = { background: 'white', border: '1px solid #F0F0F0', borderRadius: '16px', padding: '18px 20px' } as const

export default function OperatorRatingsPage() {
  const [data, setData] = useState<CompanyRatings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/operator/ratings')
      .then((res) => setData(res.data.data))
      .catch((err) => toast.error(errorOf(err, 'Failed to load your ratings')))
      .finally(() => setLoading(false))
  }, [])

  const max = data ? Math.max(1, ...Object.values(data.distribution)) : 1

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <Star size={22} color="#C0392B" /> Ratings
      </h1>
      <p style={{ fontSize: '13px', color: '#999', marginBottom: '20px', lineHeight: 1.6 }}>
        Passengers rate a trip after it has left. Travellers see your average on search results once you have {data?.publicFrom ?? 3} ratings.
        Comments and the per-bus numbers are only for you and the platform.
      </p>
      {loading && <p style={{ color: '#999', fontSize: '13px' }}>Loading...</p>}

      {data && data.count === 0 && (
        <div style={{ ...card, textAlign: 'center', color: '#999', fontSize: '14px', padding: '40px 20px' }}>
          No ratings yet. They appear here after passengers finish their trips.
        </div>
      )}

      {data && data.count > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            <div style={card}>
              <div style={{ fontSize: '12px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Your average</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                <span style={{ fontSize: '34px', fontWeight: 700, color: '#1a1a1a' }}>{data.average?.toFixed(1)}</span>
                <div>
                  <Stars value={data.average ?? 0} size={18} />
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>{data.count} rating{data.count !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <div style={{ fontSize: '12px', marginTop: '10px', color: data.publiclyShown ? '#2E8B57' : '#92400E' }}>
                {data.publiclyShown
                  ? 'Shown to travellers on search results.'
                  : `Not shown to travellers yet: it needs ${data.publicFrom} ratings.`}
              </div>
            </div>

            <div style={card}>
              <div style={{ fontSize: '12px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: '8px' }}>How passengers rated you</div>
              {[5, 4, 3, 2, 1].map((n) => {
                const c = data.distribution[String(n)] ?? 0
                return (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#666', marginTop: '4px' }}>
                    <span style={{ width: '22px' }}>{n} ★</span>
                    <div style={{ flex: 1, background: '#F3F3F3', borderRadius: '6px', height: '8px' }}>
                      <div style={{ width: `${(c / max) * 100}%`, background: '#D4A017', borderRadius: '6px', height: '8px' }} />
                    </div>
                    <span style={{ width: '24px', textAlign: 'right' }}>{c}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 10px' }}>Each bus</h2>
          <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: '24px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#999', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px' }}>Bus</th><th style={{ padding: '12px 16px' }}>Average</th><th style={{ padding: '12px 16px' }}>Ratings</th>
                </tr>
              </thead>
              <tbody>
                {data.buses.map((b) => (
                  <tr key={b.busId} style={{ borderTop: '1px solid #F5F5F5' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{b.plateNumber}{b.busType ? <span style={{ color: '#bbb', fontWeight: 400 }}> · {b.busType}</span> : null}</td>
                    <td style={{ padding: '12px 16px' }}>{b.average !== null ? <><Stars value={b.average} /> <span style={{ marginLeft: '6px' }}>{b.average.toFixed(1)}</span></> : '—'}</td>
                    <td style={{ padding: '12px 16px' }}>{b.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 10px' }}>Latest ratings</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {data.recent.map((r) => (
              <div key={r.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Stars value={r.stars} size={16} />
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{r.passenger}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#999' }}>
                    {r.fromCity} → {r.toCity} · {formatDate(r.departureTime)} · {r.plateNumber}
                  </span>
                </div>
                {r.comment && <p style={{ fontSize: '14px', color: '#444', marginTop: '8px', lineHeight: 1.5 }}>{r.comment}</p>}
                {r.commentHidden && <p style={{ fontSize: '12px', color: '#bbb', marginTop: '8px', fontStyle: 'italic' }}>Comment hidden by the platform. The stars still count.</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
