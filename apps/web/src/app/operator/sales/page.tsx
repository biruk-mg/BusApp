'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { errorOf } from '@/lib/admin'
import { CompanySalesDetail, PeriodId, asPeriod } from '@/lib/sales'
import CompanySalesView from '@/components/CompanySalesView'
import toast from 'react-hot-toast'

function MySalesScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const period = asPeriod(params.get('period'))
  const [data, setData] = useState<CompanySalesDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/operator/sales', { params: { period } })
      .then((res) => setData(res.data.data))
      .catch((err) => toast.error(errorOf(err, 'Failed to load your sales')))
      .finally(() => setLoading(false))
  }, [period])

  useEffect(() => { load() }, [load])

  const setPeriod = (p: PeriodId) => router.replace(`/operator/sales?period=${p}`)

  if (loading && !data) return <div style={{ color: '#999' }}>Loading your sales...</div>
  if (!data) {
    return <button onClick={load} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #E5E5E5', background: 'white', cursor: 'pointer' }}>Try again</button>
  }
  return (
    <div style={{ opacity: loading ? 0.6 : 1 }}>
      <CompanySalesView data={data} period={period} onPeriod={setPeriod} audience="operator" />
    </div>
  )
}

export default function OperatorSalesPage() {
  return (
    <Suspense fallback={<div style={{ color: '#999' }}>Loading your sales...</div>}>
      <MySalesScreen />
    </Suspense>
  )
}
