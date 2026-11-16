import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { RootStackParamList } from '../types/navigation'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'
import Toast from 'react-native-toast-message'

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>

export default function RegisterScreen({ navigation }: Props) {
  const { setAuth } = useAuthStore()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    if (!name || !phone || !password) {
      Toast.show({ type: 'error', text1: 'Please fill required fields' })
      return
    }
    setLoading(true)
    try {
      const res = await api.post('/auth/register', {
        name, phone, password,
        ...(email ? { email } : {})
      })
      const { user, token } = res.data.data
      await setAuth(user, token)
      Toast.show({ type: 'success', text1: `Welcome, ${user.name}!` })
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      Toast.show({ type: 'error', text1: error.response?.data?.error || 'Registration failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>
            <Text style={styles.logoRed}>Mugo</Text>
            <Text style={styles.logoGold}>Bus</Text>
          </Text>
          <Text style={styles.subtitle}>Join Thousands of Ethiopian Travelers</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.desc}>Start booking bus tickets across Ethiopia</Text>

          {[
            { label: 'Full Name', value: name, setter: setName, placeholder: 'Ruham Tesfaye', keyboard: 'default' as const },
            { label: 'Phone Number', value: phone, setter: setPhone, placeholder: '0912345678', keyboard: 'phone-pad' as const },
            { label: 'Email (optional)', value: email, setter: setEmail, placeholder: 'ruham@example.com', keyboard: 'email-address' as const },
            { label: 'Password', value: password, setter: setPassword, placeholder: '••••••••', keyboard: 'default' as const, secure: true },
          ].map(field => (
            <View key={field.label} style={styles.inputGroup}>
              <Text style={styles.label}>{field.label}</Text>
              <TextInput
                style={styles.input}
                value={field.value}
                onChangeText={field.setter}
                placeholder={field.placeholder}
                placeholderTextColor="#bbb"
                keyboardType={field.keyboard}
                secureTextEntry={field.secure}
              />
            </View>
          ))}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Creating account...' : 'Create Account'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.linkBold}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#F8F8F8' },
  header: { backgroundColor: '#1A0A0A', padding: 40, paddingTop: 80, alignItems: 'center' },
  logo: { fontSize: 40, fontWeight: 'bold', marginBottom: 8 },
  logoRed: { color: '#C0392B', fontSize: 40, fontWeight: 'bold' },
  logoGold: { color: '#D4A017', fontSize: 40, fontWeight: 'bold' },
  subtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center' },
  form: { flex: 1, backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -20, padding: 28, paddingTop: 36 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 6 },
  desc: { fontSize: 14, color: '#999', marginBottom: 28 },
  inputGroup: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12, padding: 14, fontSize: 15, color: '#1a1a1a', backgroundColor: '#FAFAFA' },
  button: { backgroundColor: '#C0392B', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { backgroundColor: '#999' },
  buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  link: { alignItems: 'center', marginTop: 20 },
  linkText: { fontSize: 14, color: '#999' },
  linkBold: { color: '#C0392B', fontWeight: 'bold' },
})