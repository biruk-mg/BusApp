/* MugoBus service worker: shows the "your bus is near" notifications, and does nothing else.
 *
 * There is deliberately NO fetch handler and NO cache here: booking and payment must always be
 * live, never served from a saved copy. Adding anything that saves pages would change that, so
 * think twice before extending this file. */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = {}
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'MugoBus'
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // A newer message about the same booking replaces the older one on the phone
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    renotify: true,
    data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ('focus' in w && new URL(w.url).origin === self.location.origin) {
          return w.navigate(target).then((c) => (c || w).focus()).catch(() => self.clients.openWindow(target))
        }
      }
      return self.clients.openWindow(target)
    })
  )
})
