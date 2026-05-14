'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Calendar, Plus, Trash2, X } from 'lucide-react'
import { formatDate, formatTime, formatPrice } from '@bus/utils'
import toast from 'react-hot-toast'

interface Schedule {
  id: string
  departureTime: string
  arrivalTime: string
  price: number
  route: { fromCity: string; toCity: string }
  bus: { plateNumber: string; busType: string; totalSeats: number }
  _count: { bookings: number }
}

interface Route { id: string; fromCity: string; toCity: string }

export default function AdminSchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ routeId: '', busId: '', departureTime: '', arrivalTime: '', price: '' })

  const fetchAll = async () => {
    try {
      const [schedulesRes, routesRes] = await Promise.all([api.get('/schedules'), api.get('/routes')])
      setSchedules(schedulesRes.data.data.schedules)
      setRoutes(routesRes.data.data.routes)
    } catch { toast.error('Failed to load data') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchAll() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/schedules', {
        routeId: form.routeId, busId: form.busId,
        departureTime: new Date(form.departureTime).toISOString(),
        arrivalTime: new Date(form.arrivalTime).toISOString(),
        price: Number(form.price),
      })
      toast.success('Schedule created!')
      setShowForm(false)
      fetchAll()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      toast.error(error.response?.data?.error || 'Failed')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule?')) return
    try {
      await api.delete(`/schedules/${id}`)
      toast.success('Deleted')
      fetchAll()
    } catch { toast.error('Failed') }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calendar size={22} color="#C0392B" /> Schedules
          </h1>
          <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>{schedules.length} schedules</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#C0392B', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={16} /> Add Schedule
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600 }}>New Schedule</h2>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}><X size={18} /></button>
          </div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#666', marginBottom: '6px' }}>Route</label>
                <select value={form.routeId} onChange={e => setForm({ ...form, routeId: e.target.value })} required
                  style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', outline: 'none' }}>
                  <option value="">Select route</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.fromCity} → {r.toCity}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#666', marginBottom: '6px' }}>Bus ID</label>
                <input value={form.busId} onChange={e => setForm({ ...form, busId: e.target.value })} placeholder="Paste bus ID" required
                  style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#666', marginBottom: '6px' }}>Departure Time</label>
                <input type="datetime-local" value={form.departureTime} onChange={e => setForm({ ...form, departureTime: e.target.value })} required
                  style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#666', marginBottom: '6px' }}>Arrival Time</label>
                <input type="datetime-local" value={form.arrivalTime} onChange={e => setForm({ ...form, arrivalTime: e.target.value })} required
                  style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#666', marginBottom: '6px' }}>Price (ETB)</label>
                <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="150" required
                  style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" style={{ background: '#C0392B', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Create</button>
              <button type="button" onClick={() => setShowForm(false)} style={{ background: '#F5F5F5', color: '#666', border: 'none', padding: '10px 24px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFAFA' }}>
              {['Route', 'Date', 'Times', 'Bus', 'Price', 'Bookings', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '14px 20px', fontSize: '12px', color: '#999', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Loading...</td></tr>}
            {schedules.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid #F5F5F5' }}>
                <td style={{ padding: '14px 20px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{s.route.fromCity} → {s.route.toCity}</span>
                </td>
                <td style={{ padding: '14px 20px', fontSize: '12px', color: '#666' }}>{formatDate(s.departureTime)}</td>
                <td style={{ padding: '14px 20px', fontSize: '12px', color: '#666' }}>{formatTime(s.departureTime)} → {formatTime(s.arrivalTime)}</td>
                <td style={{ padding: '14px 20px' }}>
                  <p style={{ fontSize: '12px', fontWeight: 500, color: '#1a1a1a' }}>{s.bus.plateNumber}</p>
                  <p style={{ fontSize: '11px', color: '#bbb' }}>{s.bus.busType}</p>
                </td>
                <td style={{ padding: '14px 20px', fontSize: '13px', fontWeight: 600, color: '#C0392B' }}>{formatPrice(s.price)}</td>
                <td style={{ padding: '14px 20px' }}>
                  <span style={{ fontSize: '12px', color: s._count.bookings > 0 ? '#2E8B57' : '#999' }}>
                    {s._count.bookings}/{s.bus.totalSeats}
                  </span>
                </td>
                <td style={{ padding: '14px 20px' }}>
                  <button onClick={() => handleDelete(s.id)} style={{ background: '#FFF5F5', color: '#C0392B', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}