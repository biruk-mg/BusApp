'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap, Marker, LatLngBoundsExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { LocateFixed } from 'lucide-react'

export interface MapBus { lat: number; lng: number }
export interface MapPickup { lat: number; lng: number; name: string }

// Map pictures come from OpenStreetMap's free server. That is fine while the site is small; once
// many passengers use it, a paid tile provider (MapTiler, Stadia, ...) should replace this address.
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'

const BUS_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>'

const busHtml = (stale: boolean) =>
  `<div style="width:40px;height:40px;border-radius:50%;background:${stale ? '#888' : '#C0392B'};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;opacity:${stale ? 0.85 : 1}">${BUS_SVG}</div>`

const pickupHtml =
  '<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:#2E8B57;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35);transform:rotate(-45deg)"><div style="width:8px;height:8px;border-radius:50%;background:white;margin:6px"></div></div>'

/**
 * The live map: a bus icon where the bus is, and the passenger's pickup point. Loaded only in the
 * browser (Leaflet needs the page). `stale` greys the bus out: the position is the last known one.
 */
export default function LiveBusMap({ bus, pickup, stale }: { bus: MapBus | null; pickup: MapPickup | null; stale: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const leaflet = useRef<typeof import('leaflet') | null>(null)
  const busMarker = useRef<Marker | null>(null)
  const pickupMarker = useRef<Marker | null>(null)
  const following = useRef(true)
  const fitted = useRef(false)
  const [ready, setReady] = useState(false)
  const [showFollow, setShowFollow] = useState(false)

  // Create the map once
  useEffect(() => {
    let cancelled = false
    let created: LeafletMap | null = null
    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !box.current) return
      leaflet.current = L
      created = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([9.03, 38.74], 12)
      L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(created)
      // Once the passenger moves the map, stop moving it for them (until they ask)
      created.on('dragstart', () => { following.current = false; setShowFollow(true) })
      map.current = created
      setReady(true)
    })()
    return () => {
      cancelled = true
      created?.remove()
      map.current = null
      busMarker.current = null
      pickupMarker.current = null
      fitted.current = false
      setReady(false)
    }
  }, [])

  const fit = () => {
    const m = map.current
    if (!m) return
    const points: [number, number][] = []
    if (bus) points.push([bus.lat, bus.lng])
    if (pickup) points.push([pickup.lat, pickup.lng])
    if (points.length === 0) return
    if (points.length === 1) m.setView(points[0], 15)
    else m.fitBounds(points as LatLngBoundsExpression, { padding: [60, 60], maxZoom: 16 })
  }

  // Keep the markers in step with the data
  useEffect(() => {
    const m = map.current
    const L = leaflet.current
    if (!ready || !m || !L) return

    if (pickup) {
      const at: [number, number] = [pickup.lat, pickup.lng]
      if (!pickupMarker.current) {
        pickupMarker.current = L.marker(at, { icon: L.divIcon({ html: pickupHtml, className: '', iconSize: [26, 26], iconAnchor: [4, 26] }), zIndexOffset: 100 }).addTo(m)
      } else pickupMarker.current.setLatLng(at)
      pickupMarker.current.unbindTooltip()
      pickupMarker.current.bindTooltip(pickup.name, { permanent: true, direction: 'top', offset: [8, -22] })
    } else if (pickupMarker.current) {
      pickupMarker.current.remove()
      pickupMarker.current = null
    }

    if (bus) {
      const at: [number, number] = [bus.lat, bus.lng]
      if (!busMarker.current) {
        busMarker.current = L.marker(at, { icon: L.divIcon({ html: busHtml(stale), className: '', iconSize: [40, 40], iconAnchor: [20, 20] }), zIndexOffset: 1000 }).addTo(m)
      } else {
        busMarker.current.setLatLng(at)
        busMarker.current.setIcon(L.divIcon({ html: busHtml(stale), className: '', iconSize: [40, 40], iconAnchor: [20, 20] }))
      }
    } else if (busMarker.current) {
      busMarker.current.remove()
      busMarker.current = null
    }

    // First time: show everything. Later: only bring the bus back if it left the screen.
    if (!fitted.current && (bus || pickup)) {
      fitted.current = true
      fit()
    } else if (following.current && bus && !m.getBounds().pad(-0.1).contains([bus.lat, bus.lng])) {
      fit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, bus?.lat, bus?.lng, pickup?.lat, pickup?.lng, pickup?.name, stale])

  return (
    <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: '1px solid #E5E5E5' }}>
      <div ref={box} style={{ height: 'min(60vh, 460px)', minHeight: '280px', background: '#EDEDED' }} />
      {showFollow && (
        <button
          onClick={() => { following.current = true; setShowFollow(false); fit() }}
          style={{ position: 'absolute', right: '12px', bottom: '30px', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '6px', background: 'white', border: '1px solid #DDD', borderRadius: '999px', padding: '9px 14px', fontSize: '13px', fontWeight: 600, color: '#1a1a1a', boxShadow: '0 2px 8px rgba(0,0,0,.2)', cursor: 'pointer' }}
        >
          <LocateFixed size={15} /> Show my bus
        </button>
      )}
    </div>
  )
}
