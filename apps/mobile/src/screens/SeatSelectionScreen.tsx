import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Platform, ActivityIndicator
} from 'react-native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { RootStackParamList } from '../types/navigation'
import { api } from '../lib/api'
import Toast from 'react-native-toast-message'

type Props = NativeStackScreenProps<RootStackParamList, 'SeatSelection'>

interface ScheduleDetail {
  id: string
  price: number
  departureTime: string
  arrivalTime: string
  route: { fromCity: string; toCity: string; estimatedDurationMin: number }
  bus: { totalSeats: number; busType: string; plateNumber: string }
}

export default function SeatSelectionScreen({ route, navigation }: Props) {
  const { scheduleId, passengers } = route.params
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null)
  const [bookedSeats, setBookedSeats] = useState<string[]>([])
  const [selectedSeats, setSelectedSeats] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const allRes = await api.get('/schedules')
        const found = allRes.data.data.schedules.find((s: ScheduleDetail) => s.id === scheduleId)
        if (found) setSchedule(found)

        const bookingsRes = await api.get('/bookings/my').catch(() => ({ data: { data: { bookings: [] } } }))
        const booked = bookingsRes.data.data.bookings
          .filter((b: { scheduleId: string; status: string; seatNumbers: string[] }) =>
            b.scheduleId === scheduleId && b.status !== 'CANCELLED')
          .flatMap((b: { seatNumbers: string[] }) => b.seatNumbers)
        setBookedSeats(booked)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [scheduleId])

  const allSeats = schedule
    ? Array.from({ length: schedule.bus.totalSeats }, (_, i) => String(i + 1).padStart(2, '0'))
    : []

  const toggleSeat = (seat: string) => {
    if (bookedSeats.includes(seat)) return
    if (selectedSeats.includes(seat)) {
      setSelectedSeats(selectedSeats.filter(s => s !== seat))
    } else {
      if (selectedSeats.length >= passengers) {
        Toast.show({ type: 'error', text1: `Select exactly ${passengers} seat${passengers > 1 ? 's' : ''}` })
        return
      }
      setSelectedSeats([...selectedSeats, seat])
    }
  }

  const handleBook = async () => {
    if (selectedSeats.length !== passengers) {
      Toast.show({ type: 'error', text1: `Please select ${passengers} seat${passengers > 1 ? 's' : ''}` })
      return
    }
    setBooking(true)
    try {
      const res = await api.post('/bookings', { scheduleId, seatNumbers: selectedSeats })
      Toast.show({ type: 'success', text1: 'Booking confirmed!' })
      navigation.replace('BookingDetail', { bookingId: res.data.data.booking.id })
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      Toast.show({ type: 'error', text1: error.response?.data?.error || 'Booking failed' })
    } finally {
      setBooking(false)
    }
  }

  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('en-ET', {
    hour: '2-digit', minute: '2-digit'
  })

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#C0392B" />
    </View>
  )

  if (!schedule) return (
    <View style={styles.center}>
      <Text>Schedule not found</Text>
    </View>
  )

  const rows = Math.ceil(allSeats.length / 4)

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerRoute}>{schedule.route.fromCity} → {schedule.route.toCity}</Text>
          <Text style={styles.headerTime}>{formatTime(schedule.departureTime)} → {formatTime(schedule.arrivalTime)}</Text>
        </View>
        <Text style={styles.headerPrice}>ETB {(schedule.price * passengers).toLocaleString()}</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Instructions */}
        <Text style={styles.instruction}>
          Select {passengers} seat{passengers > 1 ? 's' : ''} ({selectedSeats.length}/{passengers} selected)
        </Text>

        {/* Legend */}
        <View style={styles.legend}>
          {[
            { color: '#F5F5F5', border: '#E0E0E0', label: 'Available' },
            { color: '#C0392B', border: '#C0392B', label: 'Selected' },
            { color: '#CCCCCC', border: '#CCCCCC', label: 'Booked' },
          ].map(l => (
            <View key={l.label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: l.color, borderColor: l.border }]} />
              <Text style={styles.legendText}>{l.label}</Text>
            </View>
          ))}
        </View>

        {/* Bus Front */}
        <View style={styles.busFront}>
          <Text style={styles.busFrontText}>🚌 Driver — Front</Text>
        </View>

        {/* Seat Map */}
        <View style={styles.seatMap}>
          {Array.from({ length: rows }, (_, rowIndex) => {
            const left1 = allSeats[rowIndex * 4]
            const left2 = allSeats[rowIndex * 4 + 1]
            const right1 = allSeats[rowIndex * 4 + 2]
            const right2 = allSeats[rowIndex * 4 + 3]

            const isDoorRow = rowIndex === Math.floor(rows / 2)

            const SeatBtn = ({ seat }: { seat: string | undefined }) => {
              if (!seat) return <View style={styles.emptySeat} />
              const isBooked = bookedSeats.includes(seat)
              const isSelected = selectedSeats.includes(seat)
              return (
                <TouchableOpacity
                  onPress={() => toggleSeat(seat)}
                  disabled={isBooked}
                  style={[
                    styles.seat,
                    isBooked && styles.seatBooked,
                    isSelected && styles.seatSelected,
                  ]}
                >
                  <Text style={[
                    styles.seatText,
                    isSelected && styles.seatTextSelected,
                    isBooked && styles.seatTextBooked,
                  ]}>{seat}</Text>
                </TouchableOpacity>
              )
            }

            return (
              <View key={rowIndex}>
                {isDoorRow && (
                  <View style={styles.doorRow}>
                    <View style={styles.doorLine} />
                    <Text style={styles.doorText}>🚪 Door</Text>
                    <View style={styles.doorLine} />
                  </View>
                )}
                <View style={styles.seatRow}>
                  <SeatBtn seat={left1} />
                  <SeatBtn seat={left2} />
                  <View style={styles.aisle} />
                  <SeatBtn seat={right1} />
                  <SeatBtn seat={right2} />
                </View>
              </View>
            )
          })}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Confirm Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.confirmBtn,
            selectedSeats.length !== passengers && styles.confirmBtnDisabled
          ]}
          onPress={handleBook}
          disabled={booking || selectedSeats.length !== passengers}
        >
          <Text style={styles.confirmBtnText}>
            {booking ? 'Confirming...' :
              selectedSeats.length === passengers
                ? `Confirm — ETB ${(schedule.price * passengers).toLocaleString()}`
                : `Select ${passengers - selectedSeats.length} more seat${passengers - selectedSeats.length > 1 ? 's' : ''}`
            }
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8F8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { backgroundColor: '#1A0A0A', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  backText: { color: 'white', fontSize: 20 },
  headerRoute: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  headerTime: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  headerPrice: { color: '#D4A017', fontSize: 18, fontWeight: 'bold' },
  content: { flex: 1, padding: 20 },
  instruction: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', marginBottom: 16 },
  legend: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 20, height: 20, borderRadius: 4, borderWidth: 1 },
  legendText: { fontSize: 12, color: '#666' },
  busFront: { backgroundColor: '#1A0A0A', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 16, alignSelf: 'flex-start', paddingHorizontal: 16 },
  busFrontText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '500' },
  seatMap: { gap: 8 },
  seatRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seat: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center' },
  seatBooked: { backgroundColor: '#CCCCCC', borderColor: '#CCCCCC' },
  seatSelected: { backgroundColor: '#C0392B', borderColor: '#C0392B' },
  seatText: { fontSize: 12, fontWeight: '600', color: '#555' },
  seatTextSelected: { color: 'white' },
  seatTextBooked: { color: '#999' },
  emptySeat: { width: 48, height: 48 },
  aisle: { width: 24 },
  doorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
  doorLine: { flex: 1, height: 1, backgroundColor: '#E0E0E0' },
  doorText: { fontSize: 12, color: '#C0392B', fontWeight: '600' },
  footer: { padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  confirmBtn: { backgroundColor: '#C0392B', borderRadius: 12, padding: 16, alignItems: 'center' },
  confirmBtnDisabled: { backgroundColor: '#E0E0E0' },
  confirmBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
})