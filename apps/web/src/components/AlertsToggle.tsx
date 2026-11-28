'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { useI18n } from '@/i18n/LanguageProvider'
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/push'

/**
 * "Notify me when my bus is near". Shown inside the tracking card of a paid ticket. Hidden when
 * this browser cannot get notifications or the server has no keys yet.
 */
export default function AlertsToggle() {
  const { locale } = useI18n()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(false)

  useEffect(() => {
    let cancelled = false
    getPushState().then((s) => { if (!cancelled) setState(s) }).catch(() => { if (!cancelled) setState('unsupported') })
    return () => { cancelled = true }
  }, [])

  if (state === null || state === 'unsupported' || state === 'unavailable') return null

  const run = async (action: () => Promise<PushState>) => {
    setBusy(true)
    setProblem(false)
    try { setState(await action()) } catch { setProblem(true) } finally { setBusy(false) }
  }

  const note = { fontSize: '13px', color: '#555', lineHeight: 1.5 } as const
  return (
    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
      {state === 'off' && (
        <>
          <button
            onClick={() => run(() => enablePush(locale))}
            disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '10px', padding: '10px 16px', fontSize: '14px', fontWeight: 600, background: 'white', color: '#1a1a1a', border: '1px solid #DDD', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            <Bell size={16} /> Notify me when my bus is near
          </button>
          <div style={{ ...note, marginTop: '6px' }}>We will tell you when the bus starts, when it is halfway to your pickup point, and when it is almost there.</div>
        </>
      )}
      {state === 'on' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ ...note, display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#166534', fontWeight: 600 }}><Bell size={16} /> Alerts are on for this phone</span>
          <button onClick={() => run(disablePush)} disabled={busy} style={{ background: 'none', border: 'none', padding: 0, fontSize: '13px', color: '#666', textDecoration: 'underline', cursor: 'pointer' }}>Turn off</button>
        </div>
      )}
      {state === 'blocked' && (
        <div style={{ ...note, display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
          <BellOff size={16} style={{ flexShrink: 0, marginTop: '2px' }} /> Notifications are blocked for MugoBus on this phone. Allow them in your browser settings to get alerts.
        </div>
      )}
      {state === 'needs-install' && (
        <div style={note}>To get alerts on an iPhone, add MugoBus to your Home Screen first (Share, then Add to Home Screen), then open it from the icon.</div>
      )}
      {problem && <div style={{ fontSize: '12px', color: '#92400E', marginTop: '6px' }}>Something went wrong. Please try again.</div>}
    </div>
  )
}
