'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Bus, Ticket, TrendingUp } from 'lucide-react'
import { formatPrice } from '@bus/utils'

interface Stats {
  totalRevenue: number
  totalBookings: number
  totalBuses: number
  operatorName: string
}

export default function OperatorDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/operator/stats')
        setStats(res.data.data)
      } catch (err) { console.error(err) }
      finally { setLoading(false) }
    }
    fetchStats()
  }, [])

  if (loading) return <div style={{ color: '#999' }}>Loading...</div>
  if (!stats) return null

  const cards = [
    { label: 'Total Buses', value: stats.totalBuses, icon: Bus, color: '#C0392B', bg: '#FEF2F2' },
    { label: 'Total Bookings', value: stats.totalBookings, icon: Ticket, color: '#2E8B57', bg: '#F0FFF4' },
    { label: 'Total Revenue', value: formatPrice(stats.totalRevenue), icon: TrendingUp, color: '#D4A017', bg: '#FFFBEB' },
  ]

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>Welcome, {stats.operatorName}</h1>
        <p style={{ fontSize: '14px', color: '#999', marginTop: '4px' }}>Here's your business overview</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #F0F0F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', color: '#999' }}>{card.label}</p>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} color={card.color} />
                </div>
              </div>
              <p style={{ fontSize: '26px', fontWeight: 700, color: '#1a1a1a' }}>{card.value}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}