import type { Schedule } from '@bus/types'

// ─── Fare Calculator ────────────────────────────────────
export const calculateFare = (
  basePrice: number,
  passengers: number,
  seatClass: 'STANDARD' | 'LUXURY' = 'STANDARD'
): number => {
  const classMultiplier = seatClass === 'LUXURY' ? 1.5 : 1
  return basePrice * passengers * classMultiplier
}

// ─── Date Helpers ───────────────────────────────────────
export const formatDate = (date: Date | string): string => {
  return new Date(date).toLocaleDateString('en-ET', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export const formatTime = (date: Date | string): string => {
  return new Date(date).toLocaleTimeString('en-ET', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

// ─── Seat Helpers ───────────────────────────────────────
export const generateSeatMap = (totalSeats: number): string[] => {
  return Array.from({ length: totalSeats }, (_, i) => {
    const row = Math.floor(i / 4) + 1
    const col = ['A', 'B', 'C', 'D'][i % 4]
    return `${row}${col}`
  })
}

// ─── Phone Validation (Ethiopian numbers) ───────────────
export const isValidEthiopianPhone = (phone: string): boolean => {
  const ethPhoneRegex = /^(\+2519|09)\d{8}$/
  return ethPhoneRegex.test(phone)
}

// ─── Price Formatter ────────────────────────────────────
export const formatPrice = (amount: number): string => {
  return `ETB ${amount.toLocaleString('en-ET', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}