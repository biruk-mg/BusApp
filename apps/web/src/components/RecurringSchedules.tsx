'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Repeat, Plus, Pencil, Pause, Play, Trash2, X } from 'lucide-react'
import { formatPrice } from '@bus/utils'
import toast from 'react-hot-toast'

interface Route { id: string; fromCity: string; toCity: string }
interface Bus { id: string; plateNumber: string; busType: string; totalSeats: number }

interface Template {
  id: string
  routeId: string
  busId: string
  departureTime: string
  price: number
  daysOfWeek: number[]
  active: boolean
  upcomingTrips: number
  route: Route
  bus: Bus
}

// Monday first, as people read a week. Values match the API: 0 = Sunday ... 6 = Saturday
const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

const describeDays = (days: number[]) =>
  days.length === 7 ? 'Every day' : DAYS.filter((d) => days.includes(d.value)).map((d) => d.label).join(', ')

const label: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '8px',
  textTransform: 'uppercase', letterSpacing: '0.5px',
}
const input: React.CSSProperties = {
  width: '100%', border: '1px solid #E5E5E5', borderRadius: '10px', padding: '11px 14px',
  fontSize: '14px', outline: 'none', background: 'white', boxSizing: 'border-box',
}

const emptyForm = { routeId: '', busId: '', departureTime: '05:00', price: '', daysOfWeek: ALL_DAYS }

export default function RecurringSchedules({
  routes, buses, onChanged,
}: {
  routes: Route[]
  buses: Bus[]
  /** Called after anything changes, so the trips table below can refresh */
  onChanged: () => void
}) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    try {
      const res = await api.get('/operator/templates')
      setTemplates(res.data.data.templates)
    } catch {
      toast.error('Failed to load recurring schedules')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const apiError = (err: unknown, fallback: string) => {
    const error = err as { response?: { data?: { error?: string } } }
    toast.error(error.response?.data?.error || fallback)
  }

  const refresh = () => { load(); onChanged() }

  const openNew = () => { setEditingId(null); setForm(emptyForm); setShowForm(true) }
  const openEdit = (t: Template) => {
    setEditingId(t.id)
    setForm({ routeId: t.routeId, busId: t.busId, departureTime: t.departureTime, price: String(t.price), daysOfWeek: t.daysOfWeek })
    setShowForm(true)
  }
  const close = () => { setShowForm(false); setEditingId(null) }

  const toggleDay = (day: number) =>
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(day) ? f.daysOfWeek.filter((d) => d !== day) : [...f.daysOfWeek, day],
    }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.daysOfWeek.length === 0) { toast.error('Choose at least one day'); return }
    setSubmitting(true)
    const body = { routeId: form.routeId, busId: form.busId, departureTime: form.departureTime, price: Number(form.price), daysOfWeek: form.daysOfWeek }
    try {
      const res = editingId
        ? await api.put(`/operator/templates/${editingId}`, body)
        : await api.post('/operator/templates', body)
      toast.success(res.data.message || 'Saved')
      const skipped = res.data.data?.generated?.skipped?.length ?? 0
      if (skipped > 0) toast(`${skipped} day${skipped > 1 ? 's were' : ' was'} skipped because this bus already has a trip then.`, { icon: '⚠️' })
      close()
      refresh()
    } catch (err) {
      apiError(err, 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  const setActive = async (t: Template, active: boolean) => {
    if (!active && !confirm('Pause this schedule? Future trips with no bookings will be removed. Trips that already have bookings stay.')) return
    try {
      const res = await api.patch(`/operator/templates/${t.id}/active`, { active })
      toast.success(res.data.message)
      refresh()
    } catch (err) {
      apiError(err, 'Failed to update')
    }
  }

  const remove = async (t: Template) => {
    if (!confirm('Delete this recurring schedule? Future trips with no bookings will be removed. Trips that already have bookings stay.')) return
    try {
      await api.delete(`/operator/templates/${t.id}`)
      toast.success('Recurring schedule deleted')
      refresh()
    } catch (err) {
      apiError(err, 'Failed to delete')
    }
  }

  const iconBtn = (bg: string, color: string): React.CSSProperties => ({
    background: bg, color, border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600,
  })

  return (
    <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Repeat size={18} color="#C0392B" /> Recurring schedules
          </h2>
          <p style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
            Trips that run on the same days every week. They are created automatically for the next 30 days. Times are Addis Ababa time.
          </p>
        </div>
        <button
          onClick={openNew}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#C0392B', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={16} /> Add recurring
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={{ background: '#FAFAFA', border: '1px solid #F0F0F0', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700 }}>{editingId ? 'Edit recurring schedule' : 'New recurring schedule'}</h3>
            <button type="button" onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}><X size={18} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={label}>Route</label>
              <select value={form.routeId} onChange={(e) => setForm({ ...form, routeId: e.target.value })} required style={input}>
                <option value="">Select route</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.fromCity} → {r.toCity}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Bus</label>
              <select value={form.busId} onChange={(e) => setForm({ ...form, busId: e.target.value })} required style={input}>
                <option value="">Select your bus</option>
                {buses.map((b) => <option key={b.id} value={b.id}>{b.plateNumber} — {b.busType} ({b.totalSeats} seats)</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Departure time</label>
              <input type="time" value={form.departureTime} onChange={(e) => setForm({ ...form, departureTime: e.target.value })} required style={input} />
            </div>
            <div>
              <label style={label}>Ticket price (ETB)</label>
              <input type="number" min="1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="300" required style={input} />
            </div>
          </div>

          <label style={label}>Runs on</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            {DAYS.map((d) => {
              const on = form.daysOfWeek.includes(d.value)
              return (
                <button
                  type="button" key={d.value} onClick={() => toggleDay(d.value)}
                  style={{ padding: '8px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: on ? '1px solid #C0392B' : '1px solid #E5E5E5', background: on ? '#C0392B' : 'white', color: on ? 'white' : '#666' }}
                >
                  {d.label}
                </button>
              )
            })}
          </div>
          <p style={{ fontSize: '12px', color: '#999', marginBottom: '16px' }}>
            Running several departures a day (for example 5:00, 8:00 and 11:00)? Add one recurring schedule for each time. Each time needs its own bus, because a bus can only be on one trip at a time.
          </p>
          {editingId && (
            <p style={{ fontSize: '12px', color: '#9A6B00', marginBottom: '16px' }}>
              Saving replaces future trips that have no bookings. Trips with bookings, and trips you closed, stay as they are.
            </p>
          )}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="submit" disabled={submitting} style={{ background: submitting ? '#999' : '#C0392B', color: 'white', border: 'none', padding: '11px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}>
              {submitting ? 'Saving...' : editingId ? 'Save changes' : 'Create recurring schedule'}
            </button>
            <button type="button" onClick={close} style={{ background: '#F5F5F5', color: '#666', border: 'none', padding: '11px 20px', borderRadius: '10px', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      )}

      {loading && <p style={{ color: '#999', fontSize: '13px' }}>Loading...</p>}
      {!loading && templates.length === 0 && !showForm && (
        <p style={{ color: '#999', fontSize: '13px', padding: '8px 0' }}>No recurring schedules yet. Add one if you run the same trip every day.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {templates.map((t) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', border: '1px solid #F0F0F0', borderRadius: '12px', padding: '14px 16px', opacity: t.active ? 1 : 0.65 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#1a1a1a' }}>{t.departureTime}</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{t.route.fromCity} → {t.route.toCity}</div>
                <div style={{ fontSize: '12px', color: '#999' }}>
                  {describeDays(t.daysOfWeek)} · {t.bus.plateNumber} · {formatPrice(t.price)}
                </div>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', background: t.active ? '#F0FFF4' : '#F5F5F5', color: t.active ? '#2E8B57' : '#999' }}>
                {t.active ? `Active · ${t.upcomingTrips} upcoming` : 'Paused'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => openEdit(t)} style={iconBtn('#F5F5F5', '#555')}><Pencil size={13} /> Edit</button>
              {t.active
                ? <button onClick={() => setActive(t, false)} style={iconBtn('#FFF8E5', '#9A6B00')}><Pause size={13} /> Pause</button>
                : <button onClick={() => setActive(t, true)} style={iconBtn('#F0FFF4', '#2E8B57')}><Play size={13} /> Resume</button>}
              <button onClick={() => remove(t)} style={iconBtn('#FFF5F5', '#C0392B')}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
