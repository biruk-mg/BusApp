'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { MapPin, Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'

interface Route {
  id: string
  fromCity: string
  toCity: string
  distanceKm: number
  estimatedDurationMin: number
}

export default function AdminRoutesPage() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ fromCity: '', toCity: '', distanceKm: '', estimatedDurationMin: '' })

  const fetchRoutes = async () => {
    try {
      const res = await api.get('/routes')
      setRoutes(res.data.data.routes)
    } catch { toast.error('Failed to load routes') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchRoutes() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/routes', {
        fromCity: form.fromCity, toCity: form.toCity,
        distanceKm: Number(form.distanceKm),
        estimatedDurationMin: Number(form.estimatedDurationMin),
      })
      toast.success('Route created!')
      setShowForm(false)
      setForm({ fromCity: '', toCity: '', distanceKm: '', estimatedDurationMin: '' })
      fetchRoutes()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      toast.error(error.response?.data?.error || 'Failed')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this route?')) return
    try {
      await api.delete(`/routes/${id}`)
      toast.success('Route deleted')
      fetchRoutes()
    } catch { toast.error('Failed to delete') }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MapPin size={22} color="#C0392B" /> Routes
          </h1>
          <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>{routes.length} routes available</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#C0392B', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={16} /> Add Route
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a' }}>New Route</h2>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}><X size={18} /></button>
          </div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              {[
                { label: 'From City', key: 'fromCity', placeholder: 'Addis Ababa' },
                { label: 'To City', key: 'toCity', placeholder: 'Hawassa' },
                { label: 'Distance (km)', key: 'distanceKm', placeholder: '275' },
                { label: 'Duration (minutes)', key: 'estimatedDurationMin', placeholder: '270' },
              ].map(field => (
                <div key={field.key}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#666', marginBottom: '6px' }}>{field.label}</label>
                  <input
                    value={form[field.key as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    required
                    style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" style={{ background: '#C0392B', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Create Route
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{ background: '#F5F5F5', color: '#666', border: 'none', padding: '10px 24px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
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
              {['Route', 'Distance', 'Duration', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '14px 24px', fontSize: '12px', color: '#999', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Loading...</td></tr>
            )}
            {routes.map((route) => (
              <tr key={route.id} style={{ borderTop: '1px solid #F5F5F5' }}>
                <td style={{ padding: '16px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#C0392B' }} />
                    <span style={{ fontSize: '14px', fontWeight: 500, color: '#1a1a1a' }}>{route.fromCity} → {route.toCity}</span>
                  </div>
                </td>
                <td style={{ padding: '16px 24px', fontSize: '13px', color: '#666' }}>{route.distanceKm} km</td>
                <td style={{ padding: '16px 24px', fontSize: '13px', color: '#666' }}>{route.estimatedDurationMin} min</td>
                <td style={{ padding: '16px 24px' }}>
                  <button onClick={() => handleDelete(route.id)} style={{ background: '#FFF5F5', color: '#C0392B', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                    <Trash2 size={14} /> Delete
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