// Shared by the admin screens.

export interface Totals { tickets: number; total: number }

export interface AttentionItem {
  kind: string
  severity: 'high' | 'medium' | 'info'
  title: string
  detail: string
  operatorId?: string
  bookingId?: string
}

export interface Company {
  id: string
  companyName: string
  licenseNo: string
  phone: string
  status: 'ACTIVE' | 'SUSPENDED'
  suspendedAt: string | null
  suspendedReason: string | null
  isDemo: boolean
  commissionPercent: number
  notes: string | null
  createdAt: string
  buses: number
  activeStaff: number
  manager: { name: string; phone: string } | null
  upcomingTrips: number
  online30: Totals
  counter30: Totals
}

export const SEVERITY_STYLE: Record<AttentionItem['severity'], { bg: string; color: string; label: string }> = {
  high: { bg: '#FEF2F2', color: '#C0392B', label: 'Urgent' },
  medium: { bg: '#FFF8E5', color: '#9A6B00', label: 'Soon' },
  info: { bg: '#F5F5F5', color: '#666', label: 'Info' },
}

export const errorOf = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback
