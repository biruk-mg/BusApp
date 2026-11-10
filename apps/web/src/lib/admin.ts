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

// ─── Money: payouts and earnings ────────────────────────
export interface EarningsSummary {
  tickets: number
  gross: number
  commission: number
  net: number
  available: number
  pending: number
  paid: number
  due: number
  overpaid: number
}

export interface BalanceRow extends EarningsSummary {
  id: string
  companyName: string
  status: 'ACTIVE' | 'SUSPENDED'
  isDemo: boolean
  commissionPercent: number
  lastPayoutAt: string | null
}

export interface TripLine {
  scheduleId: string
  departureTime: string
  fromCity: string
  toCity: string
  tickets: number
  seats: number
  gross: number
  commission: number
  net: number
  departed: boolean
}

export type PayoutMethod = 'TELEBIRR' | 'CBE_BIRR' | 'BANK_TRANSFER' | 'CASH'

export interface PayoutRow {
  id: string
  amount: number
  method: PayoutMethod
  reference: string | null
  note: string | null
  paidAt: string
  voided: boolean
  voidReason: string | null
}

export interface EarningsPage {
  company: { id: string; companyName: string; commissionPercent: number; status: 'ACTIVE' | 'SUSPENDED'; isDemo: boolean }
  summary: EarningsSummary
  trips: TripLine[]
  tripsTruncated: boolean
  payouts: PayoutRow[]
}

export const PAYOUT_METHOD_LABEL: Record<PayoutMethod, string> = {
  TELEBIRR: 'Telebirr',
  CBE_BIRR: 'CBE Birr',
  BANK_TRANSFER: 'Bank transfer',
  CASH: 'Cash',
}
