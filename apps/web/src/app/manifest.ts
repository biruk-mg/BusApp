import type { MetadataRoute } from 'next'

// Makes the site installable: "Add to Home Screen" puts a MugoBus icon on the phone that opens
// the site full screen, like an app. There is no service worker on purpose: booking and payment
// must always be live, never served from a saved copy.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MugoBus — Book Bus Tickets Online',
    short_name: 'MugoBus',
    description: 'Book bus tickets across Ethiopia and follow your bus',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#C0392B',
    categories: ['travel'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [{ name: 'My bookings', short_name: 'Bookings', url: '/bookings', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] }],
  }
}
