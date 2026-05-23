'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Calendar, Plus, Trash2, X } from 'lucide-react'
import { formatDate, formatTime, formatPrice } from '@bus/utils'
import toast from 'react-hot-toast'

interface Schedule {
  id: string
  route: string
  departureTime: string
  arrivalTime: string
  price: number
  totalSeats: number
  bookedSeats: number
  availableSeats: number
  occupancyRate: number
  plateNumber: string
  busType: string
}

interface Route { id: string; fromCity: string; toCity: string }
interface Bus { id: string; plateNumber: string; busType: string; totalSeats: number }

export default function OperatorSchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [buses, setBuses] = useState<Bus[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    routeId: '', busId: '', departureTime: '', arrivalTime: '', price: ''
  })

  const fetchAll = async () => {
    try {
      const [schedulesRes, routesRes, busesRes] = await Promise.all([
        api.get('/operator/availability'),
        api.get('/routes'),
        api.get('/operator/buses'),
      ])
      setSchedules(schedulesRes.data.data.schedules)
      setSchedules(schedulesRes.data.data.schedules)
console.log('schedules data:', schedulesRes.data.data.schedules)
      setRoutes(routesRes.data.data.routes)
      setBuses(busesRes.data.data.buses)
    } catch {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post('/schedules', {
        routeId: form.routeId,
        busId: form.busId,
        departureTime: new Date(form.departureTime).toISOString(),
        arrivalTime: new Date(form.arrivalTime).toISOString(),
        price: Number(form.price),
      })
      toast.success('Schedule created!')
      setShowForm(false)
      setForm({ routeId: '', busId: '', departureTime: '', arrivalTime: '', price: '' })
      fetchAll()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      toast.error(error.response?.data?.error || 'Failed to create schedule')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule?')) return
    try {
      await api.delete(`/schedules/${id}`)
      toast.success('Schedule deleted')
      fetchAll()
    } catch {
      toast.error('Failed to delete')
    }
  }

  const occupancyColor = (booked: number, total: number) => {
    const rate = total > 0 ? (booked / total) * 100 : 0
    if (rate >= 80) return '#C0392B'
    if (rate >= 50) return '#D4A017'
    return '#2E8B57'
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calendar size={22} color="#C0392B" /> My Schedules
          </h1>
          <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>{schedules.length} schedules</p>
        </div>
        <button
  onClick={() => {
    console.log('clicked', showForm)
    setShowForm(!showForm)
  }}
  style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#C0392B', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
>
  <Plus size={16} /> Add Schedule
</button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '28px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a' }}>New Schedule</h2>
              <p style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>Arrival time is auto-calculated from route duration</p>
            </div>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}>
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Route</label>
                <select
                  value={form.routeId}
                  onChange={e => {
                    const routeId = e.target.value
                    setForm(prev => ({ ...prev, routeId }))
                    const route = routes.find(r => r.id === routeId) as Route & { estimatedDurationMin?: number }
                    if (route && form.departureTime && route.estimatedDurationMin) {
                      const departure = new Date(form.departureTime)
                      const arrival = new Date(departure.getTime() + route.estimatedDurationMin * 60 * 1000)
                      setForm(prev => ({ ...prev, routeId, arrivalTime: arrival.toISOString().slice(0, 16) }))
                    }
                  }}
                  required
                  style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', outline: 'none', background: 'white', boxSizing: 'border-box' }}
                >
                  <option value="">Select route</option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>{r.fromCity} → {r.toCity}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bus</label>
                <select
                  value={form.busId}
                  onChange={e => setForm({ ...form, busId: e.target.value })}
                  required
                  style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', outline: 'none', background: 'white', boxSizing: 'border-box' }}
                >
                  <option value="">Select your bus</option>
                  {buses.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.plateNumber} — {b.busType} ({b.totalSeats} seats)
                    </option>
                  ))}
                </select>
                {buses.length === 0 && (
                  <p style={{ fontSize: '11px', color: '#C0392B', marginTop: '4px' }}>No buses found. Add a bus first.</p>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Departure Time</label>
                <input
                  type="datetime-local"
                  value={form.departureTime}
                  onChange={e => {
                    const departureTime = e.target.value
                    setForm(prev => ({ ...prev, departureTime }))
                    const route = routes.find(r => r.id === form.routeId) as Route & { estimatedDurationMin?: number }
                    if (route && departureTime && route.estimatedDurationMin) {
                      const departure = new Date(departureTime)
                      const arrival = new Date(departure.getTime() + route.estimatedDurationMin * 60 * 1000)
                      setForm(prev => ({ ...prev, departureTime, arrivalTime: arrival.toISOString().slice(0, 16) }))
                    }
                  }}
                  required
                  style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Arrival Time <span style={{ color: '#2E8B57', fontWeight: 400, textTransform: 'none' }}>(auto)</span>
                </label>
                <input
                  type="datetime-local"
                  value={form.arrivalTime}
                  onChange={e => setForm({ ...form, arrivalTime: e.target.value })}
                  required
                  style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: form.arrivalTime ? '#F0FFF4' : 'white' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ticket Price (ETB)</label>
                <input
                  type="number"
                  value={form.price}
                  onChange={e => setForm({ ...form, price: e.target.value })}
                  placeholder="150"
                  min="1"
                  required
                  style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {form.routeId && form.busId && form.departureTime && form.price && (
                <div style={{ background: '#FAFAFA', borderRadius: '10px', padding: '14px', border: '1px solid #F0F0F0' }}>
                  <p style={{ fontSize: '11px', color: '#999', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Summary</p>
                  <p style={{ fontSize: '13px', color: '#1a1a1a', fontWeight: 500, marginBottom: '4px' }}>
                    {routes.find(r => r.id === form.routeId)?.fromCity} → {routes.find(r => r.id === form.routeId)?.toCity}
                  </p>
                  <p style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                    {buses.find(b => b.id === form.busId)?.plateNumber} — {buses.find(b => b.id === form.busId)?.busType}
                  </p>
                  <p style={{ fontSize: '14px', color: '#C0392B', fontWeight: 700 }}>ETB {form.price} / seat</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="submit"
                disabled={submitting}
                style={{ background: submitting ? '#999' : '#C0392B', color: 'white', border: 'none', padding: '12px 28px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}
              >
                {submitting ? 'Creating...' : 'Create Schedule'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{ background: '#F5F5F5', color: '#666', border: 'none', padding: '12px 24px', borderRadius: '10px', fontSize: '14px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}


      {/* Table */}
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFAFA' }}>
              {['Route', 'Date', 'Departure → Arrival', 'Bus', 'Price', 'Seats', 'Occupancy', 'Status', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '14px 20px', fontSize: '11px', color: '#999', fontWeight: 500 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  Loading...
                </td>
              </tr>
            )}

            {!loading && schedules.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '60px' }}>
                  <Calendar size={40} color="#E0E0E0" style={{ display: 'block', margin: '0 auto 12px' }} />
                  <p style={{ color: '#999', fontSize: '14px', marginBottom: '16px' }}>No schedules yet</p>
                </td>
              </tr>
            )}

            {!loading && schedules.map((s) => {
              const isPast = new Date(s.departureTime) < new Date()
              const isFullySold = s.availableSeats === 0
              const bookedCount = s.bookedSeats

              return (
                <tr key={s.id} style={{ borderTop: '1px solid #F5F5F5', opacity: isPast ? 0.6 : 1 }}>
                  
                  {/* Route */}
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>
                      {s.route}
                    </span>
                  </td>

                  {/* Date */}
                  <td style={{ padding: '14px 20px', fontSize: '12px', color: '#666' }}>
                    {formatDate(s.departureTime)}
                  </td>

                  {/* Time */}
                  <td style={{ padding: '14px 20px', fontSize: '12px', color: '#666' }}>
                    {formatTime(s.departureTime)} → {formatTime(s.arrivalTime)}
                  </td>

                  {/* Bus */}
                  <td style={{ padding: '14px 20px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 600, color: '#1a1a1a' }}>
                      {s.plateNumber}
                    </p>
                    <p style={{ fontSize: '11px', color: '#bbb' }}>
                      {s.busType}
                    </p>
                  </td>

                  {/* Price */}
                  <td style={{ padding: '14px 20px', fontSize: '13px', fontWeight: 700, color: '#C0392B' }}>
                    {formatPrice(s.price)}
                  </td>

                  {/* Seats */}
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>{bookedCount}</span>
                    <span style={{ fontSize: '12px', color: '#bbb' }}>/{s.totalSeats}</span>
                  </td>

                  {/* Occupancy */}
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '50px', height: '6px', background: '#F0F0F0', borderRadius: '3px' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${s.occupancyRate}%`,
                            background: occupancyColor(s.bookedSeats, s.totalSeats),
                            borderRadius: '3px'
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: occupancyColor(s.bookedSeats, s.totalSeats) }}>
                        {s.occupancyRate}%
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: '20px',
                      background: isPast ? '#F5F5F5' : isFullySold ? '#FEF2F2' : '#F0FFF4',
                      color: isPast ? '#999' : isFullySold ? '#C0392B' : '#2E8B57'
                    }}>
                      {isPast ? 'Departed' : isFullySold ? 'Full' : 'Available'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '14px 20px' }}>
                    {!isPast && (
                      <button
                        onClick={() => handleDelete(s.id)}
                        style={{
                          background: '#FFF5F5',
                          color: '#C0392B',
                          border: 'none',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>

                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}