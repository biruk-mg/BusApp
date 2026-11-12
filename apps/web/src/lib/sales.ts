// Shared by the admin sales screens: periods, types and the little pieces they have in common.
export const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
] as const
export type PeriodId = (typeof PERIODS)[number]['id']

export const asPeriod = (v: string | null): PeriodId => (PERIODS.some((p) => p.id === v) ? (v as PeriodId) : 'today')

export interface Money { tickets: number; total: number }

export interface CompanySalesRow {
  id: string
  companyName: string
  status: string
  online: Money
  counter: Money
  total: number
  commission: number
  share: number
}

export interface SalesOverview {
  period: PeriodId
  from: string
  to: string
  totals: { online: Money; counter: Money; total: number; commission: number }
  companies: CompanySalesRow[]
}

export interface CompanySalesDetail {
  period: PeriodId
  from: string
  to: string
  company: { id: string; companyName: string; status: string; isDemo: boolean; commissionPercent: number }
  totals: { online: Money; counter: Money; total: number; commission: number }
  byRoute: { fromCity: string; toCity: string; online: Money; counter: Money; total: number }[]
  byDay: { date: string; online: Money; counter: Money; total: number }[]
  bySeller: { name: string; tickets: number; total: number }[]
  counterByMethod: { method: string; tickets: number; total: number }[]
}

export const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash', TELEBIRR: 'Telebirr', CBE_BIRR: 'CBE Birr', CARD: 'Card', BANK_TRANSFER: 'Bank transfer', UNKNOWN: 'Not recorded',
}
