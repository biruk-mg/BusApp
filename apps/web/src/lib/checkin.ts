// Shared by the ticket checker screen (boarding list).

export interface CheckinTrip {
  id: string
  departureTime: string
  arrivalTime: string
  status: 'OPEN' | 'CLOSED'
  route: { fromCity: string; toCity: string }
  bus: { plateNumber: string; busType: string; totalSeats: number }
  soldSeats: number
  boardedSeats: number
}

export interface Passenger {
  id: string
  scheduleId: string
  source: 'ONLINE' | 'COUNTER'
  name: string
  phone: string | null
  seatNumbers: string[]
  ticketCode: string | null
  pickupPoint: { id: string; name: string; sequence: number; offsetMin: number } | null
  dropoffPoint: string | null
  boarded: boolean
  boardedAt: string | null
  boardedBy: string | null
}

export interface TripDetail {
  id: string
  departureTime: string
  status: 'OPEN' | 'CLOSED'
  route: { fromCity: string; toCity: string }
  bus: { plateNumber: string; busType: string; totalSeats: number }
}

export interface Lookup {
  state: 'OK' | 'ALREADY_BOARDED' | 'VOIDED'
  passenger: Passenger
  trip: { id: string; departureTime: string; route: { fromCity: string; toCity: string }; bus: { plateNumber: string } }
}

/** Same rule as the server: 8 characters, no 0, O, 1 or I. */
export const TICKET_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/

/** What was typed in the search box, tidied up so it can be compared with a ticket code. */
export const asTicketCode = (text: string) => text.replace(/\s|-/g, '').toUpperCase()

export const seatsOf = (list: Passenger[]) => list.reduce((n, p) => n + p.seatNumbers.length, 0)
export const boardedSeatsOf = (list: Passenger[]) => seatsOf(list.filter((p) => p.boarded))

/**
 * A request the server answered with "no" (not found, not valid) will not work if
 * repeated. Anything else (no signal, server asleep, server error) is worth retrying.
 */
export function isRejectedByServer(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status
  return !!status && status >= 400 && status < 500 && status !== 408 && status !== 429
}
