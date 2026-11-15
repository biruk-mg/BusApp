'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { errorOf } from '@/lib/admin'
import { MAX_COMMENT, OwnRating } from '@/lib/ratings'
import { Stars } from './Stars'
import toast from 'react-hot-toast'

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent']

/**
 * "How was your trip?" on a ticket whose trip has left. The passenger gives 1-5 stars and
 * an optional comment, and can change it for a few days. Only shown when it is allowed.
 */
export default function RatingBox({
  bookingId,
  rating,
  canRate,
  canEdit,
  onSaved,
}: {
  bookingId: string
  rating: OwnRating | null
  canRate: boolean
  canEdit: boolean
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [stars, setStars] = useState(rating?.stars ?? 0)
  const [comment, setComment] = useState(rating?.comment ?? '')
  const [saving, setSaving] = useState(false)

  if (!rating && !canRate) return null

  const save = async () => {
    if (stars < 1) { toast.error('Choose 1 to 5 stars'); return }
    setSaving(true)
    try {
      await api.put(`/bookings/${bookingId}/rating`, { stars, comment: comment.trim() || null })
      toast.success('Thank you for your rating')
      setEditing(false)
      onSaved()
    } catch (err) {
      toast.error(errorOf(err, 'Could not save your rating'))
    } finally {
      setSaving(false)
    }
  }

  const card = { background: 'white', borderRadius: '16px', border: '1px solid #EEEEEE', padding: '20px 24px', marginTop: '16px' } as const

  // Already rated, not changing it now
  if (rating && !editing) {
    return (
      <div style={card}>
        <p style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>Your rating</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Stars value={rating.stars} size={22} />
          <span style={{ fontSize: '13px', color: '#666' }}>{LABELS[rating.stars]}</span>
        </div>
        {rating.comment && <p style={{ fontSize: '14px', color: '#444', marginTop: '10px', lineHeight: 1.5 }}>{rating.comment}</p>}
        {rating.commentHidden && (
          <p style={{ fontSize: '12px', color: '#92400E', marginTop: '8px' }}>The platform hid your comment. You can still change the stars.</p>
        )}
        {canEdit && (
          <button
            onClick={() => { setStars(rating.stars); setComment(rating.comment ?? ''); setEditing(true) }}
            style={{ marginTop: '12px', background: 'none', border: 'none', padding: 0, color: '#C0392B', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            Change my rating
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={card}>
      <p style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a', marginBottom: '4px' }}>
        {rating ? 'Change your rating' : 'How was your trip?'}
      </p>
      <p style={{ fontSize: '12px', color: '#999', marginBottom: '14px' }}>
        Your stars help other travellers choose. The bus company sees your first name only.
      </p>
      <div role="radiogroup" aria-label="Stars" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => setStars(n)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '34px', lineHeight: 1, padding: '2px 4px', color: n <= stars ? '#D4A017' : '#DDD' }}
          >
            ★
          </button>
        ))}
        <span style={{ fontSize: '13px', color: '#666', marginLeft: '8px' }}>{LABELS[stars]}</span>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT))}
        disabled={rating?.commentHidden}
        placeholder="Tell us more (optional)"
        rows={3}
        style={{ width: '100%', marginTop: '12px', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E5E5E5', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', background: rating?.commentHidden ? '#F8F8F8' : 'white' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', fontSize: '11px', color: '#bbb' }}>
        <span>{rating?.commentHidden ? 'Your comment was hidden: only the stars can change.' : ''}</span>
        <span>{comment.length}/{MAX_COMMENT}</span>
      </div>
      <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
        <button
          onClick={save}
          disabled={saving || stars < 1}
          style={{ flex: 1, background: '#C0392B', color: 'white', border: 'none', padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: saving || stars < 1 ? 'default' : 'pointer', opacity: saving || stars < 1 ? 0.5 : 1 }}
        >
          {saving ? 'Saving…' : 'Send rating'}
        </button>
        {rating && (
          <button onClick={() => setEditing(false)} style={{ background: 'white', border: '1px solid #E5E5E5', color: '#555', padding: '12px 18px', borderRadius: '10px', fontSize: '14px', cursor: 'pointer' }}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
