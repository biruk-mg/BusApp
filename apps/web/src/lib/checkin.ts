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

/**
 * One line of the boarding list: one passenger, one seat. A ticket for three people is
 * three lines with the same ticketCode, each with its own name, stops and tick.
 * (A ticket from before passengers were recorded is one line for the whole booking.)
 */
export interface Passenger {
  id: string
  bookingId: string
  // How many passengers the ticket has
  groupSize: number
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
  // The whole ticket as one line (name "Abebe +2", all the seats) ...
  passenger: Passenger
  // ... and each passenger on it
  passengers: Passenger[]
  trip: { id: string; departureTime: string; route: { fromCity: string; toCity: string }; bus: { plateNumber: string } }
}

/** Same rule as the server: 8 characters, no 0, O, 1 or I. */
export const TICKET_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/

/** What was typed in the search box, tidied up so it can be compared with a ticket code. */
export const asTicketCode = (text: string) => text.replace(/\s|-/g, '').toUpperCase()

/**
 * The ticket code inside what a QR scan returned: the code itself (our tickets), or a
 * link to the ticket page that ends with it. Anything else is not one of our tickets.
 */
export function codeFromScan(text: string): string | null {
  const link = text.match(/\/tickets?\/([A-Za-z0-9-]+)/i)
  const code = asTicketCode(link ? link[1] : text)
  return TICKET_CODE_RE.test(code) ? code : null
}

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
