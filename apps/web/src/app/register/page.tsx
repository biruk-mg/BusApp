'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import toast from 'react-hot-toast'
import { SITE } from '@/lib/site'
import { useI18n } from '@/i18n/LanguageProvider'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { Bus, Phone, Lock, User, Mail } from 'lucide-react'

export default function RegisterPage() {
  const { t } = useI18n()
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post('/auth/register', { name, phone, email, password })
      const { user, token } = res.data.data
      setAuth(user, token)
      toast.success(t('register.toast', { name: user.name }))
      router.push('/')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      toast.error(error.response?.data?.error || t('register.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      {/* Left Panel */}
      <div className="auth-side" style={{ width: '420px', background: '#1A0A0A', padding: '48px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', marginBottom: '64px' }}>
            <div style={{ width: '32px', height: '32px', background: '#C0392B', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bus size={16} color="white" />
            </div>
            <span style={{ fontSize: '18px', fontWeight: 700, color: 'white' }}>
              Mugo<span style={{ color: '#C0392B' }}>Bus</span>
            </span>
          </Link>

          <h2 style={{ fontSize: '32px', fontWeight: 700, color: 'white', lineHeight: 1.3, marginBottom: '16px' }}>
            {t('register.side.a')}<br />{t('register.side.b')}<br />
            <span style={{ color: '#D4A017' }}>{t('register.side.c', { name: SITE.name })}</span>
          </h2>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
            {t('register.side.text')}
          </p>
        </div>

        <div>
          {[t('register.f1'), t('register.f2'), t('register.f3')].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#D4A017', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)' }}>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel */}
      <div className="auth-main" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px', background: '#F8F8F8' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <Link href="/" className="auth-brand-mobile" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', marginBottom: '32px' }}>
            <div style={{ width: '32px', height: '32px', background: '#C0392B', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bus size={16} color="white" />
            </div>
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>
              Mugo<span style={{ color: '#C0392B' }}>Bus</span>
            </span>
          </Link>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a1a', marginBottom: '8px' }}>
            {t('register.title')}
          </h1>
          <p style={{ fontSize: '14px', color: '#999', marginBottom: '36px' }}>
            {t('register.sub', { name: SITE.name })}
          </p>

          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Full Name */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#444', marginBottom: '8px' }}>
                {t('register.name')}
              </label>
              <div style={{ position: 'relative' }}>
                <User size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#bbb' }} />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ruham Tesfaye"
                  required
                  style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: '10px', padding: '13px 14px 13px 42px', fontSize: '14px', outline: 'none', background: 'white', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#444', marginBottom: '8px' }}>
                {t('register.phone')}
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

            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#444', marginBottom: '8px' }}>
                {t('register.email')} <span style={{ color: '#bbb', fontWeight: 400 }}>{t('register.optional')}</span>
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#bbb' }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ruham@example.com"
                  style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: '10px', padding: '13px 14px 13px 42px', fontSize: '14px', outline: 'none', background: 'white', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#444', marginBottom: '8px' }}>
                {t('register.password')}
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
              {loading ? t('register.creating') : t('register.create')}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '14px', color: '#999', marginTop: '28px' }}>
            {t('register.haveAccount')}{' '}
            <Link href="/login" style={{ color: '#C0392B', fontWeight: 600, textDecoration: 'none' }}>
              {t('register.signIn')}
            </Link>
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}><LanguageSwitcher /></div>
        </div>
      </div>
    </div>
  )
}