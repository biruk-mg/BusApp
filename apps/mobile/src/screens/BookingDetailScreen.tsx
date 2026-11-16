import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Platform, ActivityIndicator, Alert
} from 'react-native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { RootStackParamList } from '../types/navigation'
import { api } from '../lib/api'
import QRCode from 'react-native-qrcode-svg'
import Toast from 'react-native-toast-message'

type Props = NativeStackScreenProps<RootStackParamList, 'BookingDetail'>

interface BookingDetail {
  id: string
  seatNumbers: string[]
  totalPrice: number
  status: string
  qrCode: string
  schedule: {
    departureTime: string
    arrivalTime: string
    price: number
    route: { fromCity: string; toCity: string; estimatedDurationMin: number }
    bus: { busType: string; plateNumber: string; operator: { companyName: string } }
  }
}

export default function BookingDetailScreen({ route, navigation }: Props) {
  const { bookingId } = route.params
  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const res = await api.get(`/bookings/${bookingId}`)
        setBooking(res.data.data.booking)
      } catch (err) {
        console.error(err)
        Toast.show({ type: 'error', text1: 'Booking not found' })
        navigation.goBack()
      } finally {
        setLoading(false)
      }
    }
    fetchBooking()
  }, [bookingId])

  const handleCancel = () => {
    Alert.alert('Cancel Booking', 'Are you sure?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
          try {
            await api.patch(`/bookings/${bookingId}/cancel`)
            Toast.show({ type: 'success', text1: 'Booking cancelled' })
            navigation.goBack()
          } catch {
            Toast.show({ type: 'error', text1: 'Failed to cancel' })
          }
        }
      }
    ])
  }

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-ET', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  })

  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('en-ET', {
    hour: '2-digit', minute: '2-digit'
  })

  const statusColor = (status: string) => {
    if (status === 'CONFIRMED') return { bg: '#F0FFF4', color: '#2E8B57' }
    if (status === 'CANCELLED') return { bg: '#FFF5F5', color: '#C0392B' }
    return { bg: '#FFFBEB', color: '#D4A017' }
  }

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#C0392B" />
    </View>
  )

  if (!booking) return null

  const s = statusColor(booking.status)

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>E-Ticket</Text>
        <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
          <Text style={[styles.statusText, { color: s.color }]}>{booking.status}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Ticket Card */}
        <View style={styles.ticket}>
          {/* Route */}
          <View style={styles.routeSection}>
            <View>
              <Text style={styles.time}>{formatTime(booking.schedule.departureTime)}</Text>
              <Text style={styles.city}>{booking.schedule.route.fromCity}</Text>
            </View>
            <View style={styles.arrow}>
              <Text style={styles.arrowText}>→</Text>
              <Text style={styles.duration}>{booking.schedule.route.estimatedDurationMin} min</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.time}>{formatTime(booking.schedule.arrivalTime)}</Text>
              <Text style={styles.city}>{booking.schedule.route.toCity}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Details */}
          <View style={styles.details}>
            {[
              { label: 'DATE', value: formatDate(booking.schedule.departureTime) },
              { label: 'SEATS', value: booking.seatNumbers.join(', ') },
              { label: 'BUS TYPE', value: booking.schedule.bus.busType },
              { label: 'OPERATOR', value: booking.schedule.bus.operator.companyName },
              { label: 'PLATE', value: booking.schedule.bus.plateNumber },
              { label: 'TOTAL PAID', value: `ETB ${booking.totalPrice.toLocaleString()}`, highlight: true },
            ].map(item => (
              <View key={item.label} style={styles.detailItem}>
                <Text style={styles.detailLabel}>{item.label}</Text>
                <Text style={[styles.detailValue, item.highlight && styles.detailHighlight]}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.divider} />

          {/* QR Code */}
          <View style={styles.qrSection}>
            <Text style={styles.qrLabel}>Show when boarding</Text>
            <View style={styles.qrContainer}>
              <QRCode
                value={`MUGOBUS-${booking.id}`}
                size={160}
                color="#1A0A0A"
                backgroundColor="white"
              />
            </View>
            <Text style={styles.bookingId}>ID: {booking.id.slice(0, 20)}...</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {booking.status === 'CONFIRMED' && (
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelBtnText}>Cancel Booking</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8F8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { backgroundColor: '#1A0A0A', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  backText: { color: 'white', fontSize: 20 },
  headerTitle: { flex: 1, color: 'white', fontSize: 18, fontWeight: 'bold' },
  statusBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  content: { flex: 1, padding: 16 },
  ticket: { backgroundColor: 'white', borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
  routeSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24 },
  time: { fontSize: 32, fontWeight: 'bold', color: '#1a1a1a' },
  city: { fontSize: 13, color: '#999', marginTop: 4 },
  arrow: { alignItems: 'center' },
  arrowText: { fontSize: 24, color: '#D4A017' },
  duration: { fontSize: 11, color: '#999', marginTop: 4 },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginHorizontal: 20, borderStyle: 'dashed' },
  details: { padding: 24, flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  detailItem: { width: '45%' },
  detailLabel: { fontSize: 10, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  detailValue: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  detailHighlight: { color: '#C0392B', fontSize: 16 },
  qrSection: { padding: 24, alignItems: 'center' },
  qrLabel: { fontSize: 13, color: '#999', marginBottom: 16 },
  qrContainer: { padding: 16, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#F0F0F0' },
  bookingId: { fontSize: 11, color: '#bbb', marginTop: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  actions: { marginTop: 16, gap: 12 },
  cancelBtn: { backgroundColor: 'white', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  cancelBtnText: { color: '#C0392B', fontSize: 15, fontWeight: '600' },
})