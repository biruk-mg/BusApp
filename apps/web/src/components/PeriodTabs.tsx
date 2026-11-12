'use client'

import { PERIODS, PeriodId } from '@/lib/sales'

export default function PeriodTabs({ value, onChange }: { value: PeriodId; onChange: (p: PeriodId) => void }) {
  return (
    <div role="tablist" aria-label="Period" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {PERIODS.map((p) => {
        const on = p.id === value
        return (
          <button
            key={p.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(p.id)}
            style={{ padding: '8px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: on ? '1px solid #C0392B' : '1px solid #E5E5E5', background: on ? '#C0392B' : 'white', color: on ? 'white' : '#555' }}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
