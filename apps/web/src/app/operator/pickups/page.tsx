'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { MapPin, ArrowUp, ArrowDown, Trash2, Plus, Pencil, Check, X, Crosshair, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'

type Kind = 'PICKUP' | 'DROPOFF' | 'BOTH'

interface RouteItem { id: string; fromCity: string; toCity: string }
interface Point { id: string; routeId: string; name: string; kind: Kind; sequence: number; offsetMin: number; lat: number | null; lng: number | null }

const KIND_LABEL: Record<Kind, string> = { PICKUP: 'Pickup', DROPOFF: 'Drop-off', BOTH: 'Pickup & drop-off' }

const errorText = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: string } } }).response?.data?.error || fallback

const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`
const coordsText = (p: { lat: number | null; lng: number | null }) => (p.lat !== null && p.lng !== null ? `${p.lat}, ${p.lng}` : '')

const inputStyle = { padding: '10px 12px', borderRadius: '10px', border: '1px solid #E5E5E5', fontSize: '14px', background: 'white', minWidth: 0 }
const iconBtn = { background: 'white', border: '1px solid #E5E5E5', borderRadius: '8px', padding: '7px', cursor: 'pointer', display: 'flex', color: '#666' }

export default function OperatorPickupsPage() {
  const [routes, setRoutes] = useState<RouteItem[]>([])
  const [points, setPoints] = useState<Point[]>([])
  const [routeId, setRouteId] = useState('')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', kind: 'PICKUP' as Kind, offsetMin: '0', location: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', kind: 'PICKUP' as Kind, offsetMin: '0', location: '' })

  const load = async () => {
    try {
      const [routesRes, pointsRes] = await Promise.all([api.get('/routes'), api.get('/operator/pickups')])
      const list: RouteItem[] = routesRes.data.data.routes
      setRoutes(list)
      setPoints(pointsRes.data.data.pickupPoints)
      setRouteId((current) => current || list[0]?.id || '')
    } catch (err) {
      toast.error(errorText(err, 'Failed to load pickup points'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const current = points
    .filter((p) => p.routeId === routeId)
    .sort((a, b) => a.sequence - b.sequence || a.offsetMin - b.offsetMin)

  const add = async () => {
    if (!form.name.trim()) { toast.error('Enter a name'); return }
    try {
      await api.post('/operator/pickups', {
        routeId,
        name: form.name.trim(),
        kind: form.kind,
        sequence: current.length ? Math.max(...current.map((p) => p.sequence)) + 1 : 0,
        offsetMin: Math.max(0, Number(form.offsetMin) || 0),
        location: form.location.trim() || null,
      })
      setForm({ name: '', kind: form.kind, offsetMin: '0', location: '' })
      toast.success('Added')
      await load()
    } catch (err) { toast.error(errorText(err, 'Failed to add')) }
  }

  // Give every point its position in the list as its order number
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= current.length) return
    const reordered = [...current]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    try {
      await Promise.all(
        reordered.map((p, i) => (p.sequence !== i ? api.put(`/operator/pickups/${p.id}`, { sequence: i }) : null))
      )
      await load()
    } catch (err) { toast.error(errorText(err, 'Failed to reorder')) }
  }

  const startEdit = (p: Point) => {
    setEditingId(p.id)
    setDraft({ name: p.name, kind: p.kind, offsetMin: String(p.offsetMin), location: coordsText(p) })
  }

  const saveEdit = async () => {
    if (!editingId) return
    try {
      await api.put(`/operator/pickups/${editingId}`, {
        name: draft.name.trim(),
        kind: draft.kind,
        offsetMin: Math.max(0, Number(draft.offsetMin) || 0),
        location: draft.location.trim() || null, // empty removes the map position
      })
      setEditingId(null)
      toast.success('Saved')
      await load()
    } catch (err) { toast.error(errorText(err, 'Failed to save')) }
  }

  // Standing at the stop: let the phone fill in the position
  const useMyLocation = (apply: (text: string) => void) => {
    if (!navigator.geolocation) { toast.error('This browser cannot read your location'); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => apply(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
      () => toast.error('Could not get your location. Allow location access, or paste the coordinates instead.'),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  const remove = async (p: Point) => {
    if (!confirm(`Delete "${p.name}"?`)) return
    try {
      await api.delete(`/operator/pickups/${p.id}`)
      toast.success('Deleted')
      await load()
    } catch (err) { toast.error(errorText(err, 'Failed to delete')) }
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <MapPin size={22} color="#C0392B" /> Pickup Points
        </h1>
        <p style={{ fontSize: '13px', color: '#999', marginTop: '4px', maxWidth: '620px', lineHeight: 1.5 }}>
          Where passengers board after the bus leaves the main station. List them in the order the bus visits them and
          set the minutes after departure. Passengers must choose one when booking, as soon as a route has at least one pickup point.
        </p>
      </div>

      {loading && <p style={{ color: '#999' }}>Loading...</p>}

      {!loading && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: '#999', display: 'block', marginBottom: '6px' }}>Route</label>
            <select value={routeId} onChange={(e) => { setRouteId(e.target.value); setEditingId(null) }} style={{ ...inputStyle, minWidth: '240px' }}>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.fromCity} → {r.toCity}</option>
              ))}
            </select>
          </div>

          <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '8px 20px', marginBottom: '20px' }}>
            {current.length === 0 && (
              <p style={{ padding: '24px 0', fontSize: '14px', color: '#999' }}>
                No points on this route yet. Passengers are not asked to choose one until you add at least one pickup point.
              </p>
            )}

            {current.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 0', borderTop: i === 0 ? 'none' : '1px solid #F5F5F5', flexWrap: 'wrap' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#FFF5F5', color: '#C0392B', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {i + 1}
                </div>

                {editingId === p.id ? (
                  <>
                    <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ ...inputStyle, flex: '1 1 160px' }} />
                    <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Kind })} style={inputStyle}>
                      {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                    <input type="number" min={0} value={draft.offsetMin} onChange={(e) => setDraft({ ...draft, offsetMin: e.target.value })} style={{ ...inputStyle, width: '90px' }} />
                    <button onClick={saveEdit} aria-label="Save" style={{ ...iconBtn, color: '#2E8B57' }}><Check size={16} /></button>
                    <button onClick={() => setEditingId(null)} aria-label="Cancel" style={iconBtn}><X size={16} /></button>
                    <div style={{ flex: '1 1 100%', display: 'flex', gap: '8px', alignItems: 'center', paddingLeft: '40px' }}>
                      <input
                        value={draft.location}
                        onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                        placeholder="Map position: 9.0301, 38.7400 or a Google Maps link (empty = none)"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button type="button" onClick={() => useMyLocation((t) => setDraft((d) => ({ ...d, location: t })))} aria-label="Use my current location" title="Use my current location" style={iconBtn}>
                        <Crosshair size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>{p.name}</div>
                      <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                        {KIND_LABEL[p.kind]} · {p.offsetMin === 0 ? 'at departure' : `+${p.offsetMin} min after departure`}
                      </div>
                      <div style={{ fontSize: '12px', marginTop: '3px' }}>
                        {p.lat !== null && p.lng !== null ? (
                          <a href={mapsUrl(p.lat, p.lng)} target="_blank" rel="noopener noreferrer" style={{ color: '#2E8B57', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                            <MapPin size={12} /> On the map ({p.lat}, {p.lng}) <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span style={{ color: '#B7791F' }}>No map position yet: passengers will not see minutes to this point</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" style={{ ...iconBtn, opacity: i === 0 ? 0.35 : 1 }}><ArrowUp size={16} /></button>
                    <button onClick={() => move(i, 1)} disabled={i === current.length - 1} aria-label="Move down" style={{ ...iconBtn, opacity: i === current.length - 1 ? 0.35 : 1 }}><ArrowDown size={16} /></button>
                    <button onClick={() => startEdit(p)} aria-label="Edit" style={iconBtn}><Pencil size={16} /></button>
                    <button onClick={() => remove(p)} aria-label="Delete" style={{ ...iconBtn, color: '#C0392B' }}><Trash2 size={16} /></button>
                  </>
                )}
              </div>
            ))}
          </div>

          <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a', marginBottom: '14px' }}>Add a point</h2>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 180px' }}>
                <label style={{ fontSize: '12px', color: '#999', display: 'block', marginBottom: '6px' }}>Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Megenagna" style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#999', display: 'block', marginBottom: '6px' }}>Type</label>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })} style={inputStyle}>
                  {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#999', display: 'block', marginBottom: '6px' }}>Minutes after departure</label>
                <input type="number" min={0} value={form.offsetMin} onChange={(e) => setForm({ ...form, offsetMin: e.target.value })} style={{ ...inputStyle, width: '120px' }} />
              </div>
              <div style={{ flex: '1 1 100%' }}>
                <label style={{ fontSize: '12px', color: '#999', display: 'block', marginBottom: '6px' }}>Map position (optional, but needed for arrival minutes)</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="9.0301, 38.7400 or a full Google Maps link"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button type="button" onClick={() => useMyLocation((t) => setForm((f) => ({ ...f, location: t })))} title="Use my current location" style={{ ...iconBtn, padding: '10px 12px', gap: '6px', alignItems: 'center', fontSize: '13px' }}>
                    <Crosshair size={16} /> I am here
                  </button>
                </div>
                <p style={{ fontSize: '12px', color: '#999', marginTop: '8px', lineHeight: 1.5 }}>
                  <a href="https://www.google.com/maps" target="_blank" rel="noopener noreferrer" style={{ color: '#C0392B' }}>Open Google Maps</a>, find the stop, then
                  on a computer right-click it and click the two numbers; on a phone press and hold the spot and copy the numbers shown. Paste them here.
                  Short links (maps.app.goo.gl) cannot be read; open the link first, then copy the numbers or the long address.
                </p>
              </div>
              <button onClick={add} style={{ background: '#C0392B', color: 'white', border: 'none', borderRadius: '10px', padding: '11px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={16} /> Add
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
