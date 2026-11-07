// Shared by the counter screens (seller, manager report, public ticket).

export const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  TELEBIRR: 'Telebirr',
  CBE_BIRR: 'CBE Birr',
  BANK_TRANSFER: 'Bank transfer',
  CARD: 'Card',
}

/** The Addis Ababa calendar day (YYYY-MM-DD) of a moment, or of now. */
export const addisDay = (when: Date | string = new Date()) =>
  new Date(when).toLocaleDateString('en-CA', { timeZone: 'Africa/Addis_Ababa' })

export const errorOf = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback

export interface CounterSale {
  id: string
  status: string
  seatNumbers: string[]
  totalPrice: number
  passengerName: string | null
  passengerPhone: string | null
  ticketCode: string | null
  createdAt: string
  voidedAt: string | null
  voidReason: string | null
  canVoid: boolean
  qrCode?: string
  schedule: { departureTime: string; arrivalTime: string; route: { fromCity: string; toCity: string }; bus: { plateNumber: string } }
  pickupPoint: { name: string; offsetMin: number } | null
  dropoffPoint: { name: string } | null
  payment: { method: string; reference: string | null; amount: number } | null
  soldByStaff: { id: string; user: { name: string } } | null
  voidedByStaff: { user: { name: string } } | null
}
