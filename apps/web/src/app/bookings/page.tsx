'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import Navbar from '@/components/Navbar'
import { formatDate, formatTime, formatPrice } from '@bus/utils'
import { Bus, Calendar, MapPin, Ticket } from 'lucide-react'

interface Booking {
  id: string
  seatNumbers: string[]
  totalPrice: number
  status: string
  createdAt: string
  schedule: {
    departureTime: string
    arrivalTime: string
    price: number
    route: { fromCity: string; toCity: string }
    bus: { busType: string; plateNumber: string }
  }
}

export default function BookingsPage() {
  const router = useRouter()
  const { isAuthenticated, loadFromStorage } = useAuthStore()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFromStorage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    const fetchBookings = async () => {
      try {
        const res = await api.get('/bookings/my')
        setBookings(res.data.data.bookings)
      } catch {
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }
    fetchBookings()
  }, [isAuthenticated, router])

  const statusColor = (status: string) => {
    if (status === 'CONFIRMED') return 'bg-green-100 text-green-700'
    if (status === 'CANCELLED') return 'bg-red-100 text-red-700'
    if (status === 'COMPLETED') return 'bg-gray-100 text-gray-700'
    return 'bg-yellow-100 text-yellow-700'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Ticket size={24} />
          My Bookings
        </h1>

        {loading && (
          <div className="text-center py-20 text-gray-500">Loading bookings...</div>
        )}

        {!loading && bookings.length === 0 && (
          <div className="text-center py-20">
            <Bus size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No bookings yet</p>
            <button
              onClick={() => router.push('/')}
              className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Book a Trip
            </button>
          </div>
        )}

        <div className="space-y-4">
          {bookings.map((booking) => (
            <div
              key={booking.id}
              onClick={() => router.push(`/bookings/${booking.id}`)}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-blue-600" />
                  <span className="font-semibold">
                    {booking.schedule.route.fromCity} → {booking.schedule.route.toCity}
                  </span>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColor(booking.status)}`}>
                  {booking.status}
                </span>
              </div>

              <div className="flex items-center gap-6 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <Calendar size={14} />
                  {formatDate(booking.schedule.departureTime)}
                </div>
                <div>
                  {formatTime(booking.schedule.departureTime)} → {formatTime(booking.schedule.arrivalTime)}
                </div>
                <div>Seats: {booking.seatNumbers.join(', ')}</div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
                <span className="text-sm text-gray-500">
                  {booking.schedule.bus.busType} • {booking.schedule.bus.plateNumber}
                </span>
                <span className="font-bold text-blue-600">
                  {formatPrice(booking.totalPrice)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}