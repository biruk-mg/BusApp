import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Platform
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../types/navigation'
import { useAuthStore } from '../store/auth.store'
import Toast from 'react-native-toast-message'

const CITIES = [
  'Addis Ababa', 'Adama', 'Hawassa', 'Bahir Dar',
  'Dire Dawa', 'Jimma', 'Mekelle', 'Gondar'
]

const POPULAR_ROUTES = [
  { from: 'Addis Ababa', to: 'Adama', price: 150, duration: '1h 30m', emoji: '🌇' },
  { from: 'Addis Ababa', to: 'Hawassa', price: 350, duration: '4h 30m', emoji: '🏞️' },
  { from: 'Addis Ababa', to: 'Bahir Dar', price: 550, duration: '8h', emoji: '⛪' },
  { from: 'Addis Ababa', to: 'Jimma', price: 400, duration: '6h', emoji: '🌿' },
]

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function HomeScreen() {
  const navigation = useNavigation<Nav>()
  const { user } = useAuthStore()
  const [fromCity, setFromCity] = useState('Addis Ababa')
  const [toCity, setToCity] = useState('')
  const [date, setDate] = useState('')
  const [passengers, setPassengers] = useState(1)
  const [showFromPicker, setShowFromPicker] = useState(false)
  const [showToPicker, setShowToPicker] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const handleSearch = () => {
    if (!fromCity || !toCity || !date) {
      Toast.show({ type: 'error', text1: 'Please fill all search fields' })
      return
    }
    navigation.navigate('Search', { fromCity, toCity, date, passengers })
  }

  const CityPicker = ({ cities, onSelect, onClose }: { cities: string[], onSelect: (c: string) => void, onClose: () => void }) => (
    <View style={styles.pickerOverlay}>
      <View style={styles.picker}>
        <Text style={styles.pickerTitle}>Select City</Text>
        {cities.map(city => (
          <TouchableOpacity key={city} style={styles.pickerItem} onPress={() => { onSelect(city); onClose() }}>
            <Text style={styles.pickerItemText}>{city}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.pickerClose} onPress={onClose}>
          <Text style={{ color: '#C0392B', fontWeight: 'bold' }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good {new Date().getHours() < 12 ? 'Morning' : 'Afternoon'} 👋</Text>
            <Text style={styles.userName}>{user?.name?.split(' ')[0]}</Text>
          </View>
          <View style={styles.logoSmall}>
            <Text style={{ color: '#C0392B', fontSize: 18, fontWeight: 'bold' }}>M</Text>
          </View>
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Where do you want{'\n'}to <Text style={{ color: '#C0392B' }}>travel?</Text></Text>
        </View>

        {/* Search Card */}
        <View style={styles.searchCard}>
          {/* From */}
          <Text style={styles.searchLabel}>FROM</Text>
          <TouchableOpacity style={styles.searchInput} onPress={() => setShowFromPicker(true)}>
            <Text style={[styles.searchInputText, !fromCity && { color: '#bbb' }]}>
              {fromCity || 'Select departure city'}
            </Text>
            <Text>▼</Text>
          </TouchableOpacity>

          {/* Swap Icon */}
          <View style={styles.swapRow}>
            <View style={styles.swapLine} />
            <TouchableOpacity style={styles.swapBtn} onPress={() => {
              const temp = fromCity
              setFromCity(toCity)
              setToCity(temp)
            }}>
              <Text style={{ fontSize: 16 }}>⇅</Text>
            </TouchableOpacity>
            <View style={styles.swapLine} />
          </View>

          {/* To */}
          <Text style={styles.searchLabel}>TO</Text>
          <TouchableOpacity style={styles.searchInput} onPress={() => setShowToPicker(true)}>
            <Text style={[styles.searchInputText, !toCity && { color: '#bbb' }]}>
              {toCity || 'Select destination city'}
            </Text>
            <Text>▼</Text>
          </TouchableOpacity>

          {/* Date */}
          <Text style={[styles.searchLabel, { marginTop: 12 }]}>DATE</Text>
          <TextInput
            style={styles.searchInput}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#bbb"
          />

          {/* Passengers */}
          <Text style={[styles.searchLabel, { marginTop: 12 }]}>PASSENGERS</Text>
          <View style={styles.passengersRow}>
            <TouchableOpacity
              style={styles.passBtn}
              onPress={() => setPassengers(Math.max(1, passengers - 1))}
            >
              <Text style={styles.passBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.passCount}>{passengers}</Text>
            <TouchableOpacity
              style={styles.passBtn}
              onPress={() => setPassengers(Math.min(5, passengers + 1))}
            >
              <Text style={styles.passBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Search Button */}
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
            <Text style={styles.searchBtnText}>🔍 Search Buses</Text>
          </TouchableOpacity>
        </View>

        {/* Popular Routes */}
        <Text style={styles.sectionTitle}>Popular Routes</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.routesScroll}>
          {POPULAR_ROUTES.map(route => (
            <TouchableOpacity
              key={route.to}
              style={styles.routeCard}
              onPress={() => {
                setFromCity(route.from)
                setToCity(route.to)
                setDate(today)
              }}
            >
              <Text style={styles.routeEmoji}>{route.emoji}</Text>
              <Text style={styles.routeTo}>{route.to}</Text>
              <Text style={styles.routeDuration}>{route.duration}</Text>
              <Text style={styles.routePrice}>ETB {route.price}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* City Pickers */}
      {showFromPicker && (
        <CityPicker
          cities={CITIES.filter(c => c !== toCity)}
          onSelect={setFromCity}
          onClose={() => setShowFromPicker(false)}
        />
      )}
      {showToPicker && (
        <CityPicker
          cities={CITIES.filter(c => c !== fromCity)}
          onSelect={setToCity}
          onClose={() => setShowToPicker(false)}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8F8' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, backgroundColor: '#1A0A0A' },
  greeting: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  userName: { color: 'white', fontSize: 20, fontWeight: 'bold', marginTop: 2 },
  logoSmall: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#C0392B', alignItems: 'center', justifyContent: 'center' },
  hero: { backgroundColor: '#1A0A0A', padding: 20, paddingBottom: 40 },
  heroTitle: { color: 'white', fontSize: 28, fontWeight: 'bold', lineHeight: 36 },
  searchCard: { backgroundColor: 'white', borderRadius: 20, margin: 16, marginTop: -20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
  searchLabel: { fontSize: 11, color: '#999', fontWeight: '600', letterSpacing: 1, marginBottom: 6 },
  searchInput: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, padding: 14, backgroundColor: '#FAFAFA', marginBottom: 4 },
  searchInputText: { fontSize: 15, color: '#1a1a1a' },
  swapRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  swapLine: { flex: 1, height: 1, backgroundColor: '#F0F0F0' },
  swapBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', marginHorizontal: 12 },
  passengersRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 4 },
  passBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  passBtnText: { fontSize: 20, color: '#C0392B', fontWeight: 'bold' },
  passCount: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', minWidth: 30, textAlign: 'center' },
  searchBtn: { backgroundColor: '#C0392B', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  searchBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', padding: 20, paddingBottom: 12 },
  routesScroll: { paddingLeft: 20 },
  routeCard: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginRight: 12, width: 140, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  routeEmoji: { fontSize: 32, marginBottom: 8 },
  routeTo: { fontSize: 14, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 4 },
  routeDuration: { fontSize: 12, color: '#999', marginBottom: 8 },
  routePrice: { fontSize: 14, fontWeight: 'bold', color: '#C0392B' },
  pickerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  picker: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '70%' },
  pickerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 16 },
  pickerItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  pickerItemText: { fontSize: 16, color: '#333' },
  pickerClose: { alignItems: 'center', marginTop: 16, padding: 12 },
})