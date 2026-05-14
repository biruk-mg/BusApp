'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import toast from 'react-hot-toast'
import { Bus, Phone, Lock } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { phone, password })
      const { user, token } = res.data.data
      setAuth(user, token)
      toast.success(`Welcome back, ${user.name}!`)
      if (user.role === 'ADMIN') router.push('/admin')
      else if (user.role === 'OPERATOR') router.push('/operator')
      else router.push('/')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      toast.error(error.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      {/* Left Panel */}
      <div style={{ width: '420px', background: '#1A0A0A', padding: '48px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', marginBottom: '64px' }}>
            <div style={{ width: '32px', height: '32px', background: '#C0392B', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bus size={16} color="white" />
            </div>
            <span style={{ fontSize: '18px', fontWeight: 700, color: 'white' }}>
              Ethio<span style={{ color: '#C0392B' }}>Bus</span>
            </span>
          </Link>

          <h2 style={{ fontSize: '32px', fontWeight: 700, color: 'white', lineHeight: 1.3, marginBottom: '16px' }}>
            Ethiopia's #1<br />Bus Booking<br />
            <span style={{ color: '#D4A017' }}>Platform</span>
          </h2>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
            Book tickets to Adama, Hawassa, Bahir Dar, Jimma and more — all from your phone.
          </p>
        </div>

        <div>
          {['Secure payments', 'Instant e-tickets', '24/7 support'].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#D4A017', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)' }}>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px', background: '#F8F8F8' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a1a', marginBottom: '8px' }}>
            Welcome back
          </h1>
          <p style={{ fontSize: '14px', color: '#999', marginBottom: '36px' }}>
            Sign in to your EthioBus account
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#444', marginBottom: '8px' }}>
                Phone Number
              </label>
              <div style={{ position: 'relative' }}>
                <Phone size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#bbb' }} />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0912345678"
                  required
                  style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: '10px', padding: '13px 14px 13px 42px', fontSize: '14px', outline: 'none', background: 'white', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#444', marginBottom: '8px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#bbb' }} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: '10px', padding: '13px 14px 13px 42px', fontSize: '14px', outline: 'none', background: 'white', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ background: loading ? '#999' : '#C0392B', color: 'white', border: 'none', borderRadius: '10px', padding: '14px', fontSize: '15px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', marginTop: '4px' }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '14px', color: '#999', marginTop: '28px' }}>
            Don&apos;t have an account?{' '}
            <Link href="/register" style={{ color: '#C0392B', fontWeight: 600, textDecoration: 'none' }}>
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}