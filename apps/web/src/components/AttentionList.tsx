'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { AttentionItem, SEVERITY_STYLE, errorOf } from '@/lib/admin'
import toast from 'react-hot-toast'

/** The "needs attention" panel: what the admin should look at first. */
export default function AttentionList({ items, total, onChanged }: { items: AttentionItem[]; total?: number; onChanged?: () => void }) {
  const [refunding, setRefunding] = useState<string | null>(null)

  // The money is sent back outside this app; this records that it was done
  const markRefunded = async (bookingId: string) => {
    const reference = window.prompt('Refund done. Enter the refund receipt number (or leave empty):')
    if (reference === null) return
    setRefunding(bookingId)
    try {
      await api.post(`/admin/bookings/${bookingId}/refund`, { reference: reference.trim() || undefined })
      toast.success('Refund recorded')
      onChanged?.()
    } catch (err) {
      toast.error(errorOf(err, 'Could not record the refund'))
    } finally {
      setRefunding(null)
    }
  }

  if (items.length === 0) {
    return <p style={{ color: '#2E8B57', fontSize: '14px', padding: '8px 0' }}>Nothing needs your attention right now.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {items.map((item, i) => {
        const sev = SEVERITY_STYLE[item.severity]
        const body = (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '12px 14px', borderRadius: '12px', background: sev.bg }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: sev.color, border: `1px solid ${sev.color}`, borderRadius: '10px', padding: '2px 8px', flexShrink: 0, marginTop: '2px' }}>
              {sev.label}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>{item.title}</div>
              {item.detail && <div style={{ fontSize: '12px', color: '#666', marginTop: '2px', lineHeight: 1.5 }}>{item.detail}</div>}
            </div>
          </div>
        )
        if (item.kind === 'REFUND_NEEDED' && item.bookingId) {
          return (
            <div key={`${item.kind}-${item.bookingId}-${i}`}>
              {body}
              <div style={{ display: 'flex', gap: '8px', padding: '6px 4px 0', flexWrap: 'wrap' }}>
                <button onClick={() => markRefunded(item.bookingId!)} disabled={refunding === item.bookingId}
                  style={{ background: '#2E8B57', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: refunding === item.bookingId ? 0.6 : 1 }}>
                  I sent the refund
                </button>
                {item.operatorId && (
                  <Link href={`/admin/companies/${item.operatorId}`} style={{ fontSize: '12px', color: '#666', alignSelf: 'center' }}>Company</Link>
                )}
              </div>
            </div>
          )
        }
        return item.operatorId
          ? <Link key={`${item.kind}-${item.bookingId ?? item.operatorId}-${i}`} href={`/admin/companies/${item.operatorId}`} style={{ textDecoration: 'none' }}>{body}</Link>
          : <div key={i}>{body}</div>
      })}
      {total !== undefined && total > items.length && (
        <p style={{ fontSize: '12px', color: '#999' }}>And {total - items.length} more.</p>
      )}
    </div>
  )
}
