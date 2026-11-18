'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bus } from 'lucide-react'
import { useI18n } from '@/i18n/LanguageProvider'
import {
  PromptMemory, EMPTY_MEMORY, parseMemory, recordDismissal, recordInstalled,
  isInAppBrowser, isIosDevice, shouldShowInstallPrompt,
} from '@/lib/installPrompt'

const STORAGE_KEY = 'mugobus-install-prompt'
const SHOW_AFTER_MS = 6000

// Chrome's own install prompt, kept until the passenger taps the button
interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * A small sheet at the bottom of the screen: "Add MugoBus to your home screen". On Android it
 * opens the phone's install prompt; on iPhone, which has no such prompt, it shows the two taps.
 * It is polite: a few seconds after arriving, only on passenger pages, not for anyone who
 * already installed it, and "Not now" quietens it for a week (three times, then never).
 */
export default function InstallPrompt() {
  const { t } = useI18n()
  const path = usePathname()
  const deferred = useRef<InstallEvent | null>(null)
  const [canInstall, setCanInstall] = useState(false)
  const [env, setEnv] = useState<{ standalone: boolean; touch: boolean; ios: boolean; inApp: boolean } | null>(null)
  const [memory, setMemory] = useState<PromptMemory>(EMPTY_MEMORY)
  const [visible, setVisible] = useState(false)

  const save = (m: PromptMemory) => {
    setMemory(m)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(m)) } catch { /* private mode: it just asks again next time */ }
  }

  // Look at the phone and at what was stored last time
  useEffect(() => {
    const ua = navigator.userAgent
    setEnv({
      standalone: window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
      touch: window.matchMedia('(pointer: coarse)').matches,
      ios: isIosDevice(ua, navigator.platform, navigator.maxTouchPoints),
      inApp: isInAppBrowser(ua),
    })
    try { setMemory(parseMemory(localStorage.getItem(STORAGE_KEY))) } catch { /* ignore */ }

    const onPrompt = (e: Event) => {
      e.preventDefault() // keep it, so our own button can open it
      deferred.current = e as InstallEvent
      setCanInstall(true)
    }
    const onInstalled = () => {
      deferred.current = null
      setCanInstall(false)
      setVisible(false)
      setMemory((m) => {
        const next = recordInstalled(m)
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
        return next
      })
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Show it a few seconds after the passenger arrives, and hide it again if the page stops being a fit
  useEffect(() => {
    const eligible = !!env && shouldShowInstallPrompt({ ...env, canInstall, memory, now: Date.now(), path: path ?? '/' })
    if (!eligible) { setVisible(false); return }
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    return () => clearTimeout(timer)
  }, [env, canInstall, memory, path])

  const notNow = () => { setVisible(false); save(recordDismissal(memory, Date.now())) }

  const install = async () => {
    const ev = deferred.current
    if (!ev) return
    setVisible(false)
    await ev.prompt()
    const choice = await ev.userChoice
    deferred.current = null
    setCanInstall(false)
    if (choice.outcome === 'dismissed') save(recordDismissal(memory, Date.now()))
  }

  if (!visible || !env) return null
  const showHow = env.ios && !canInstall // iPhone: no install button, only the two taps

  return (
    <div
      role="dialog"
      aria-label={t('install.title')}
      style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9000, display: 'flex', justifyContent: 'center', padding: '0 12px calc(12px + env(safe-area-inset-bottom, 0px))', pointerEvents: 'none' }}
    >
      <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: '460px', background: 'white', borderRadius: '18px', boxShadow: '0 8px 32px rgba(0,0,0,0.22)', border: '1px solid #EEE', padding: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#C0392B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bus size={22} color="white" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a', lineHeight: 1.3 }}>{t('install.title')}</div>
            <div style={{ fontSize: '13px', color: '#666', marginTop: '4px', lineHeight: 1.5 }}>{showHow ? t('install.ios') : t('install.body')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
          {showHow ? (
            <button onClick={notNow} style={{ flex: 1, background: '#C0392B', color: 'white', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
              {t('install.gotit')}
            </button>
          ) : (
            <>
              <button onClick={notNow} style={{ flex: 1, background: '#F4F4F4', color: '#555', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                {t('install.later')}
              </button>
              <button onClick={install} style={{ flex: 2, background: '#C0392B', color: 'white', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                {t('install.cta')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
