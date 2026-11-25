import webpush from 'web-push'

/**
 * How a notification reaches a phone. Everything else only knows this small interface, so
 * another way of reaching people (SMS, later) can be added without touching the alert rules.
 *
 * The real channel is standard Web Push (W3C Push API + VAPID): the browser's own push service
 * delivers it (Google's for Chrome, Apple's for Safari, Mozilla's for Firefox). There is no
 * Firebase SDK and no account with any company, just two keys that belong to you.
 */
export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushNote {
  title: string
  body: string
  /** Where tapping the notification goes (a path on the website) */
  url: string
  /** A newer notification with the same tag replaces the older one on the phone */
  tag: string
}

/** OK = handed to the push service. GONE = that browser no longer exists (delete it). FAILED = any other problem. */
export type SendResult = 'OK' | 'GONE' | 'FAILED'

export interface NotificationChannel {
  send(target: PushTarget, note: PushNote): Promise<SendResult>
}

// A notification that could not be delivered within 5 minutes is dropped, not shown late:
// "your bus is arriving" is wrong ten minutes later.
const TTL_SECONDS = 300

export function webPushChannel(env: NodeJS.ProcessEnv = process.env): NotificationChannel | null {
  const publicKey = env.VAPID_PUBLIC_KEY
  const privateKey = env.VAPID_PRIVATE_KEY
  const subject = env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return null
  webpush.setVapidDetails(subject, publicKey, privateKey)

  return {
    async send(target, note) {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify({ title: note.title, body: note.body, url: note.url, tag: note.tag }),
          { TTL: TTL_SECONDS, urgency: 'high', timeout: 10_000 }
        )
        return 'OK'
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        // 404 and 410 are the push service's way of saying "this subscription is gone"
        if (status === 404 || status === 410) return 'GONE'
        console.error('Web push failed:', status ?? error)
        return 'FAILED'
      }
    },
  }
}

let cached: NotificationChannel | null | undefined
let override: NotificationChannel | null | undefined

/** The channel to use now, or null when alerts are not set up (the keys are missing). */
export function getChannel(): NotificationChannel | null {
  if (override !== undefined) return override
  if (cached === undefined) cached = webPushChannel()
  return cached
}

/** For tests only: replace the channel (null = alerts off). Call with undefined to go back to the real one. */
export function setChannelForTests(channel: NotificationChannel | null | undefined): void {
  override = channel
}

export const publicVapidKey = (env: NodeJS.ProcessEnv = process.env): string | null => env.VAPID_PUBLIC_KEY || null
