import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Platform
} from 'react-native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { RootStackParamList } from '../types/navigation'
import { api } from '../lib/api'

interface Schedule {
  id: string
  price: number
  departureTime: string
  arrivalTime: string
  availableSeats: number
  route: { fromCity: string; toCity: string; estimatedDurationMin: number }
  bus: { plateNumber: string; busType: string; totalSeats: number; operator: { companyName: string } }
}

type Props = NativeStackScreenProps<RootStackParamList, 'Search'>

export default function SearchScreen({ route, navigation }: Props) {
  const { fromCity, toCity, date, passengers } = route.params
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const res = await api.get('/schedules/search', {
          params: { fromCity, toCity, date }
        })
        setSchedules(res.data.data.schedules)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchSchedules()
  }, [])

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-ET', {
      hour: '2-digit', minute: '2-digit'
    })
  }

  const formatDuration = (min: number) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerRoute}>{fromCity} → {toCity}</Text>
          <Text style={styles.headerSub}>{date} • {passengers} passenger{passengers > 1 ? 's' : ''}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#C0392B" />
          <Text style={styles.loadingText}>Searching buses...</Text>
        </View>
      ) : schedules.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🚌</Text>
          <Text style={styles.emptyText}>No buses found for this route and date</Text>
          <TouchableOpacity style={styles.backBtnRed} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Try Another Date</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          <Text style={styles.resultCount}>{schedules.length} bus{schedules.length > 1 ? 'es' : ''} available</Text>
          {schedules.map(schedule => (
            <View key={schedule.id} style={styles.card}>
              {/* Times */}
              <View style={styles.timesRow}>
                <View style={styles.timeBlock}>
                  <Text style={styles.time}>{formatTime(schedule.departureTime)}</Text>
                  <Text style={styles.city}>{fromCity}</Text>
                </View>
                <View style={styles.durationBlock}>
                  <Text style={styles.duration}>{formatDuration(schedule.route.estimatedDurationMin)}</Text>
                  <View style={styles.durationLine}>
                    <View style={styles.durationDot} />
                  </View>
                  <Text style={styles.busType}>{schedule.bus.busType}</Text>
                </View>
                <View style={[styles.timeBlock, { alignItems: 'flex-end' }]}>
                  <Text style={styles.time}>{formatTime(schedule.arrivalTime)}</Text>
                  <Text style={styles.city}>{toCity}</Text>
                </View>
              </View>

              {/* Operator */}
              <View style={styles.operatorRow}>
                <View style={styles.operatorBadge}>
                  <Text style={styles.operatorText}>{schedule.bus.operator.companyName}</Text>
                </View>
                <Text style={styles.plate}>{schedule.bus.plateNumber}</Text>
                <Text style={styles.seats}>{schedule.availableSeats} seats left</Text>
              </View>

              {/* Price & Book */}
              <View style={styles.bottomRow}>
                <Text style={styles.price}>ETB {schedule.price.toLocaleString()}</Text>
                <TouchableOpacity
                  style={styles.bookBtn}
                  onPress={() => navigation.navigate('SeatSelection', {
                    scheduleId: schedule.id,
                    passengers
                  })}
                >
                  <Text style={styles.bookBtnText}>Book Now</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8F8' },
  header: { backgroundColor: '#1A0A0A', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, flexDirection: 'row', alignItems: 'center', gap: 16 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  backText: { color: 'white', fontSize: 20 },
  headerRoute: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  headerSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: '#999', marginTop: 12, fontSize: 14 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: '#999', fontSize: 15, textAlign: 'center', marginBottom: 20 },
  backBtnRed: { backgroundColor: '#C0392B', borderRadius: 10, padding: 14, paddingHorizontal: 28 },
  backBtnText: { color: 'white', fontWeight: 'bold' },
  list: { flex: 1, padding: 16 },
  resultCount: { color: '#999', fontSize: 13, marginBottom: 12 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  timesRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  timeBlock: { flex: 1 },
  time: { fontSize: 24, fontWeight: 'bold', color: '#1a1a1a' },
  city: { fontSize: 12, color: '#999', marginTop: 2 },
  durationBlock: { alignItems: 'center', paddingHorizontal: 12 },
  duration: { fontSize: 11, color: '#999', marginBottom: 4 },
  durationLine: { width: 60, height: 1, backgroundColor: '#E0E0E0', position: 'relative', alignItems: 'center', justifyContent: 'center' },
  durationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C0392B' },
  busType: { fontSize: 10, color: '#C0392B', fontWeight: '600', marginTop: 4 },
  operatorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F5F5F5', marginBottom: 12 },
  operatorBadge: { backgroundColor: '#FEF2F2', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  operatorText: { color: '#C0392B', fontSize: 11, fontWeight: '600' },
  plate: { fontSize: 12, color: '#999' },
  seats: { fontSize: 12, color: '#999', marginLeft: 'auto' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { fontSize: 22, fontWeight: 'bold', color: '#C0392B' },
  bookBtn: { backgroundColor: '#C0392B', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  bookBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
})