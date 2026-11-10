'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { EarningsPage, errorOf } from '@/lib/admin'
import EarningsView from '@/components/EarningsView'
import { Wallet } from 'lucide-react'
import toast from 'react-hot-toast'

export default function OperatorEarningsPage() {
  const [data, setData] = useState<EarningsPage | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/operator/earnings')
      .then((res) => setData(res.data.data))
      .catch((err) => toast.error(errorOf(err, 'Failed to load your earnings')))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <Wallet size={22} color="#C0392B" /> Earnings
      </h1>
      {loading && <p style={{ color: '#999', fontSize: '13px' }}>Loading...</p>}
      {data && <EarningsView data={data} audience="operator" />}
    </div>
  )
}
