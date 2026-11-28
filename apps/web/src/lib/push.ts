// "Notify me when my bus is near", phone side: ask the browser for permission, register the
// service worker (public/sw.js, which only shows notifications) and tell the API about this
// browser. Standard Web Push: no Firebase, no third-party account.
import { api } from '@/lib/api'
import type { Locale } from '@/i18n/config'

export type PushState =
  | 'unsupported' // this browser cannot do it: show nothing
  | 'unavailable' // the server has no keys set up yet: show nothing
  | 'needs-install' // iPhone: only works once MugoBus is on the Home Screen
  | 'blocked' // the person said no in the browser: only they can change it
  | 'off'
  | 'on'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

let keyCache: { enabled: boolean; publicKey: string | null } | null = null
async function serverKey() {
  if (keyCache) return keyCache
  const res = await api.get('/push/public-key')
  keyCache = res.data.data as { enabled: boolean; publicKey: string | null }
  return keyCache
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported'
  // On an iPhone, a page opened in Safari has no push at all; the Home Screen app does
  if (isIos() && !isInstalled()) return 'needs-install'
  if (!canPush()) return 'unsupported'
  try {
    if (!(await serverKey()).enabled) return 'unavailable'
  } catch {
    return 'unavailable'
  }
  if (Notification.permission === 'denied') return 'blocked'
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = registration ? await registration.pushManager.getSubscription() : null
  return subscription && Notification.permission === 'granted' ? 'on' : 'off'
}

/** Asks permission, subscribes this browser and tells the API. Returns the new state. */
export async function enablePush(locale: Locale): Promise<PushState> {
  const { enabled, publicKey } = await serverKey()
  if (!enabled || !publicKey) return 'unavailable'
  const permission = await Notification.requestPermission()
  if (permission === 'denied') return 'blocked'
  if (permission !== 'granted') return 'off' // the question was closed without an answer

  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))

  const json = subscription.toJSON()
  await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys, lang: locale })
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = registration ? await registration.pushManager.getSubscription() : null
  if (subscription) {
    await api.delete('/push/subscribe', { data: { endpoint: subscription.endpoint } }).catch(() => {})
    await subscription.unsubscribe().catch(() => {})
  }
  return 'off'
}

/**
 * On logout: this browser must stop getting the logged-out person's alerts (a shared phone).
 * Takes the token as an argument, because the logout is already clearing it from storage.
 * Best effort: never throws, never blocks the logout.
 */
export async function forgetThisBrowser(token: string): Promise<void> {
  try {
    if (typeof window === 'undefined' || !canPush()) return
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = registration ? await registration.pushManager.getSubscription() : null
    if (!subscription) return
    await fetch(`${API_URL}/api/v1/push/subscribe`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      keepalive: true,
    }).catch(() => {})
    await subscription.unsubscribe().catch(() => {})
  } catch {
    /* nothing to do */
  }
}
