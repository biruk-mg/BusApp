import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Platform
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../types/navigation'
import { api } from '../lib/api'

interface Booking {
  id: string
  seatNumbers: string[]
  totalPrice: number
  status: string
  schedule: {
    departureTime: string
    route: { fromCity: string; toCity: string }
    bus: { busType: string }
  }
}

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function BookingsScreen() {
  const navigation = useNavigation<Nav>()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const res = await api.get('/bookings/my')
        setBookings(res.data.data.bookings)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchBookings()
  }, [])

  const statusColor = (status: string) => {
    if (status === 'CONFIRMED') return { bg: '#F0FFF4', color: '#2E8B57' }
    if (status === 'CANCELLED') return { bg: '#FFF5F5', color: '#C0392B' }
    return { bg: '#FFFBEB', color: '#D4A017' }
  }

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-ET', {
    weekday: 'short', month: 'short', day: 'numeric'
  })

  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('en-ET', {
    hour: '2-digit', minute: '2-digit'
  })

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Trips</Text>
        <Text style={styles.headerSub}>{bookings.length} booking{bookings.length !== 1 ? 's' : ''}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#C0392B" />
        </View>
      ) : bookings.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🎫</Text>
          <Text style={styles.emptyTitle}>No bookings yet</Text>
          <Text style={styles.emptyDesc}>Book your first bus trip!</Text>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {bookings.map(booking => {
            const s = statusColor(booking.status)
            return (
              <TouchableOpacity
                key={booking.id}
                style={styles.card}
                onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.route}>
                    {booking.schedule.route.fromCity} → {booking.schedule.route.toCity}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.statusText, { color: s.color }]}>{booking.status}</Text>
                  </View>
                </View>
                <View style={styles.cardDetails}>
                  <Text style={styles.detail}>📅 {formatDate(booking.schedule.departureTime)}</Text>
                  <Text style={styles.detail}>🕐 {formatTime(booking.schedule.departureTime)}</Text>
                  <Text style={styles.detail}>💺 {booking.seatNumbers.join(', ')}</Text>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={styles.busType}>{booking.schedule.bus.busType}</Text>
                  <Text style={styles.price}>ETB {booking.totalPrice.toLocaleString()}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8F8' },
  header: { backgroundColor: '#1A0A0A', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  headerTitle: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  headerSub: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 6 },
  emptyDesc: { fontSize: 14, color: '#999' },
  list: { flex: 1, padding: 16 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  route: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a', flex: 1 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },
  cardDetails: { gap: 4, marginBottom: 12 },
  detail: { fontSize: 13, color: '#666' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F5F5F5' },
  busType: { fontSize: 12, color: '#999' },
  price: { fontSize: 16, fontWeight: 'bold', color: '#C0392B' },
})