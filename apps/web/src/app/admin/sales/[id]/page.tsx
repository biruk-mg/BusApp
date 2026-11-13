'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/lib/api'
import { errorOf } from '@/lib/admin'
import { CompanySalesDetail, PeriodId, asPeriod } from '@/lib/sales'
import CompanySalesView from '@/components/CompanySalesView'
import toast from 'react-hot-toast'

function CompanySalesScreen() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const params = useSearchParams()
  const period = asPeriod(params.get('period'))
  const [data, setData] = useState<CompanySalesDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/admin/sales/${id}`, { params: { period } })
      .then((res) => setData(res.data.data))
      .catch((err) => toast.error(errorOf(err, 'Failed to load this company')))
      .finally(() => setLoading(false))
  }, [id, period])

  useEffect(() => { load() }, [load])

  const setPeriod = (p: PeriodId) => router.replace(`/admin/sales/${id}?period=${p}`)
  return (
    <div>
      <Link href={`/admin/sales?period=${period}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#666', textDecoration: 'none', marginBottom: '16px' }}>
        <ArrowLeft size={14} /> All companies
      </Link>

      {loading && !data ? (
        <div style={{ color: '#999' }}>Loading...</div>
      ) : !data ? (
        <button onClick={load} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #E5E5E5', background: 'white', cursor: 'pointer' }}>Try again</button>
      ) : (
        <div style={{ opacity: loading ? 0.6 : 1 }}>
          <CompanySalesView data={data} period={period} onPeriod={setPeriod} audience="admin" />
        </div>
      )}
    </div>
  )
}

export default function AdminCompanySalesPage() {
  return (
    <Suspense fallback={<div style={{ color: '#999' }}>Loading...</div>}>
      <CompanySalesScreen />
    </Suspense>
  )
}
