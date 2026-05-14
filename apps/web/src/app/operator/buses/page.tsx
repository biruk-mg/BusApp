'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Bus, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'

interface BusItem {
  id: string
  plateNumber: string
  totalSeats: number
  busType: string
  _count: { schedules: number }
}

export default function OperatorBusesPage() {
  const [buses, setBuses] = useState<BusItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ plateNumber: '', totalSeats: '', busType: 'STANDARD' })

  const fetchBuses = async () => {
    try {
      const res = await api.get('/operator/buses')
      setBuses(res.data.data.buses)
    } catch { toast.error('Failed to load buses') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchBuses() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/operator/buses', {
        plateNumber: form.plateNumber,
        totalSeats: Number(form.totalSeats),
        busType: form.busType,
      })
      toast.success('Bus added!')
      setShowForm(false)
      setForm({ plateNumber: '', totalSeats: '', busType: 'STANDARD' })
      fetchBuses()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      toast.error(error.response?.data?.error || 'Failed')
    }
  }

  const busTypeStyle = (type: string) => {
    if (type === 'LUXURY') return { bg: '#FFFBEB', color: '#D4A017' }
    if (type === 'MINIBUS') return { bg: '#FFF5F5', color: '#C0392B' }
    return { bg: '#EEF2FF', color: '#4169E1' }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Bus size={22} color="#C0392B" /> My Buses
          </h1>
          <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>{buses.length} buses registered</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#C0392B', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={16} /> Add Bus
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Add New Bus</h2>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}><X size={18} /></button>
          </div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#666', marginBottom: '6px' }}>Plate Number</label>
                <input value={form.plateNumber} onChange={e => setForm({ ...form, plateNumber: e.target.value })} placeholder="AA-12345" required
                  style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#666', marginBottom: '6px' }}>Total Seats</label>
                <input type="number" value={form.totalSeats} onChange={e => setForm({ ...form, totalSeats: e.target.value })} placeholder="45" required
                  style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#666', marginBottom: '6px' }}>Bus Type</label>
                <select value={form.busType} onChange={e => setForm({ ...form, busType: e.target.value })}
                  style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', outline: 'none' }}>
                  <option value="STANDARD">Standard</option>
                  <option value="LUXURY">Luxury</option>
                  <option value="MINIBUS">Minibus</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" style={{ background: '#C0392B', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Add Bus</button>
              <button type="button" onClick={() => setShowForm(false)} style={{ background: '#F5F5F5', color: '#666', border: 'none', padding: '10px 24px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {loading && <p style={{ color: '#999' }}>Loading...</p>}
        {buses.map((bus) => {
          const ts = busTypeStyle(bus.busType)
          return (
            <div key={bus.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Bus size={18} color="#C0392B" />
                  </div>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a' }}>{bus.plateNumber}</span>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', background: ts.bg, color: ts.color }}>{bus.busType}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: '#999' }}>Total Seats</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{bus.totalSeats}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', color: '#999' }}>Schedules</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{bus._count.schedules}</span>
              </div>
              <div style={{ borderTop: '1px solid #F5F5F5', paddingTop: '12px' }}>
                <p style={{ fontSize: '11px', color: '#bbb' }}>ID: {bus.id.slice(0, 20)}...</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}