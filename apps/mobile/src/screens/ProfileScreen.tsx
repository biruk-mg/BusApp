import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native'
import { useAuthStore } from '../store/auth.store'
import Toast from 'react-native-toast-message'

export default function ProfileScreen() {
  const { user, logout } = useAuthStore()

  const handleLogout = async () => {
    await logout()
    Toast.show({ type: 'success', text1: 'Logged out successfully' })
  }

  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.phone}>{user?.phone}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{user?.role}</Text>
        </View>
      </View>

      <View style={styles.section}>
        {[
          { icon: '🎫', label: 'My Bookings', desc: 'View all your trips' },
          { icon: '🔔', label: 'Notifications', desc: 'Manage alerts' },
          { icon: '🔒', label: 'Change Password', desc: 'Update your password' },
          { icon: '📞', label: 'Contact Support', desc: 'Get help from our team' },
          { icon: '📋', label: 'Terms & Privacy', desc: 'Legal information' },
        ].map(item => (
          <TouchableOpacity key={item.label} style={styles.menuItem}>
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuDesc}>{item.desc}</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>🚪 Logout</Text>
      </TouchableOpacity>

      <Text style={styles.version}>MugoBus v1.0.0</Text>
      <View style={{ height: 100 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8F8' },
  header: { backgroundColor: '#1A0A0A', padding: 32, paddingTop: Platform.OS === 'ios' ? 60 : 40, alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#C0392B', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: 'white', fontSize: 28, fontWeight: 'bold' },
  name: { color: 'white', fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  phone: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 12 },
  roleBadge: { backgroundColor: 'rgba(212,160,23,0.2)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4 },
  roleText: { color: '#D4A017', fontSize: 12, fontWeight: '600' },
  section: { backgroundColor: 'white', borderRadius: 16, margin: 16, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  menuIcon: { fontSize: 20, marginRight: 14 },
  menuLabel: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', marginBottom: 2 },
  menuDesc: { fontSize: 12, color: '#999' },
  menuArrow: { fontSize: 20, color: '#bbb' },
  logoutBtn: { backgroundColor: 'white', borderRadius: 12, margin: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  logoutText: { color: '#C0392B', fontSize: 15, fontWeight: '600' },
  version: { textAlign: 'center', color: '#bbb', fontSize: 12, marginBottom: 8 },
})