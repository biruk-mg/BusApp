'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { errorOf } from '@/lib/admin'
import { AdminRatings } from '@/lib/ratings'
import { Stars } from '@/components/Stars'
import { formatDate } from '@bus/utils'
import { Star } from 'lucide-react'
import toast from 'react-hot-toast'

const card = { background: 'white', border: '1px solid #F0F0F0', borderRadius: '16px', padding: '16px 18px' } as const

export default function AdminRatingsPage() {
  const [data, setData] = useState<AdminRatings | null>(null)
  const [loading, setLoading] = useState(true)
  const [operatorId, setOperatorId] = useState('')
  const [onlyHidden, setOnlyHidden] = useState(false)
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/admin/ratings', { params: { operatorId: operatorId || undefined, hidden: onlyHidden ? 'true' : undefined, page } })
      .then((res) => setData(res.data.data))
      .catch((err) => toast.error(errorOf(err, 'Failed to load ratings')))
      .finally(() => setLoading(false))
  }, [operatorId, onlyHidden, page])

  useEffect(() => { load() }, [load])

  const hide = async (id: string) => {
    const reason = window.prompt('Why hide this comment? (the company will not see it, the stars still count)')
    if (!reason || reason.trim().length < 3) return
    setBusyId(id)
    try { await api.post(`/admin/ratings/${id}/hide`, { reason: reason.trim() }); toast.success('Comment hidden'); load() }
    catch (err) { toast.error(errorOf(err, 'Could not hide the comment')) }
    finally { setBusyId(null) }
  }
  const unhide = async (id: string) => {
    setBusyId(id)
    try { await api.post(`/admin/ratings/${id}/unhide`); toast.success('Comment shown again'); load() }
    catch (err) { toast.error(errorOf(err, 'Could not show the comment')) }
    finally { setBusyId(null) }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Star size={22} color="#C0392B" /> Ratings
      </h1>
      <p style={{ fontSize: '13px', color: '#999', margin: '4px 0 20px', lineHeight: 1.6 }}>
        Every rating from passengers. Hide an abusive comment: the company stops seeing it, but the stars still count.
      </p>

      {data && data.companies.length > 0 && (
        <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: '20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#999', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 16px' }}>Company</th><th style={{ padding: '12px 16px' }}>Average</th>
                <th style={{ padding: '12px 16px' }}>Ratings</th><th style={{ padding: '12px 16px' }}>Public</th>
              </tr>
            </thead>
            <tbody>
              {data.companies.map((c) => (
                <tr key={c.operatorId} onClick={() => { setOperatorId(operatorId === c.operatorId ? '' : c.operatorId); setPage(1) }}
                  style={{ borderTop: '1px solid #F5F5F5', cursor: 'pointer', background: operatorId === c.operatorId ? '#FEF2F2' : 'transparent' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{c.companyName}</td>
                  <td style={{ padding: '12px 16px' }}>{c.average !== null ? <><Stars value={c.average} /> <span style={{ marginLeft: '6px' }}>{c.average.toFixed(1)}</span></> : '—'}</td>
                  <td style={{ padding: '12px 16px' }}>{c.count}</td>
                  <td style={{ padding: '12px 16px', color: c.publiclyShown ? '#2E8B57' : '#bbb' }}>{c.publiclyShown ? 'Shown' : 'Not yet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#555', marginBottom: '14px', cursor: 'pointer' }}>
        <input type="checkbox" checked={onlyHidden} onChange={(e) => { setOnlyHidden(e.target.checked); setPage(1) }} />
        Only hidden comments
      </label>
      {operatorId && (
        <button onClick={() => { setOperatorId(''); setPage(1) }} style={{ marginLeft: '14px', background: 'none', border: 'none', color: '#C0392B', fontSize: '13px', cursor: 'pointer' }}>
          Show all companies
        </button>
      )}

      {loading && !data && <p style={{ color: '#999', fontSize: '13px' }}>Loading...</p>}
      {data && data.ratings.length === 0 && <div style={{ ...card, color: '#999', fontSize: '14px', textAlign: 'center', padding: '32px' }}>No ratings found.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', opacity: loading ? 0.6 : 1 }}>
        {data?.ratings.map((r) => (
          <div key={r.id} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Stars value={r.stars} size={16} />
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{r.passenger}</span>
                <span style={{ fontSize: '12px', color: '#999' }}>→ {r.companyName}</span>
              </div>
              <span style={{ fontSize: '12px', color: '#999' }}>{r.fromCity} → {r.toCity} · {formatDate(r.departureTime)} · {r.plateNumber}</span>
            </div>
            {r.comment && <p style={{ fontSize: '14px', color: '#444', marginTop: '8px', lineHeight: 1.5 }}>{r.comment}</p>}
            {r.commentHidden && (
              <p style={{ fontSize: '12px', color: '#92400E', marginTop: '6px' }}>Hidden from the company{r.commentHiddenReason ? `: ${r.commentHiddenReason}` : ''}</p>
            )}
            {r.comment && (
              <button
                disabled={busyId === r.id}
                onClick={() => (r.commentHidden ? unhide(r.id) : hide(r.id))}
                style={{ marginTop: '10px', background: 'white', border: '1px solid #E5E5E5', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, color: r.commentHidden ? '#2E8B57' : '#C0392B', cursor: 'pointer' }}
              >
                {r.commentHidden ? 'Show comment again' : 'Hide comment'}
              </button>
            )}
          </div>
        ))}
      </div>

      {data && pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginTop: '18px', fontSize: '13px', color: '#666' }}>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #E5E5E5', background: 'white', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.4 : 1 }}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #E5E5E5', background: 'white', cursor: page >= pages ? 'default' : 'pointer', opacity: page >= pages ? 0.4 : 1 }}>Next</button>
        </div>
      )}
    </div>
  )
}
