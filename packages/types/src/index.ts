// ─── User ───────────────────────────────────────────────
export type UserRole = 'CUSTOMER' | 'OPERATOR' | 'DRIVER' | 'ADMIN'

// What a person may do at an operator company (set by the company's manager)
export type StaffRole = 'MANAGER' | 'SELLER' | 'CHECKER'

export interface StaffInfo {
  role: StaffRole
  operatorId: string
  companyName: string
  // The platform admin suspended this company: staff can log in but cannot work
  suspended?: boolean
}

export interface User {
  id: string
  name: string
  phone: string
  email?: string
  role: UserRole
  // Only for operator staff; null or missing for passengers and the admin
  staff?: StaffInfo | null
  createdAt: Date
}

// ─── Route ──────────────────────────────────────────────
export interface Route {
  id: string
  fromCity: string
  toCity: string
  distanceKm: number
  estimatedDurationMin: number
}

// ─── Bus ────────────────────────────────────────────────
export type BusType = 'STANDARD' | 'LUXURY' | 'MINIBUS'

export interface Bus {
  id: string
  operatorId: string
  plateNumber: string
  totalSeats: number
  busType: BusType
}

// ─── Schedule ───────────────────────────────────────────
export interface Schedule {
  id: string
  routeId: string
  route: Route
  busId: string
  bus: Bus
  departureTime: Date
  arrivalTime: Date
  price: number
  availableSeats: number
}

// ─── Booking ────────────────────────────────────────────
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'

export interface Booking {
  id: string
  userId: string
  scheduleId: string
  schedule?: Schedule
  seatNumbers: string[]
  totalPrice: number
  status: BookingStatus
  qrCode: string
  createdAt: Date
}

// ─── Payment ────────────────────────────────────────────
export type PaymentMethod = 'TELEBIRR' | 'CBE_BIRR' | 'CARD' | 'BANK_TRANSFER'
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED'

export interface Payment {
  id: string
  bookingId: string
  amount: number
  method: PaymentMethod
  chapaRef?: string
  status: PaymentStatus
  createdAt: Date
}

// ─── Operator ───────────────────────────────────────────
export interface Operator {
  id: string
  companyName: string
  licenseNo: string
  phone: string
}

// ─── API Response Wrappers ──────────────────────────────
export interface ApiSuccess<T> {
  success: true
  data: T
  message?: string
}

export interface ApiError {
  success: false
  error: string
  code?: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ─── Search ─────────────────────────────────────────────
export interface SearchParams {
  fromCity: string
  toCity: string
  date: string
  passengers: number
}

export interface SearchResult {
  schedules: Schedule[]
  total: number
}