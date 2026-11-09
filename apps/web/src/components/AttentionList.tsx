'use client'

import Link from 'next/link'
import { AttentionItem, SEVERITY_STYLE } from '@/lib/admin'

/** The "needs attention" panel: what the admin should look at first. */
export default function AttentionList({ items, total }: { items: AttentionItem[]; total?: number }) {
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
