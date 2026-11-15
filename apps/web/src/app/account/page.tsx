'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Bus, KeyRound, LogOut, ShieldAlert, UserCircle } from 'lucide-react'
import { formatDate } from '@bus/utils'
import type { User } from '@bus/types'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { homeFor, STAFF_ROLE_LABEL } from '@/lib/staffHome'
import { SITE } from '@/lib/site'
import Navbar from '@/components/Navbar'

const MIN_PASSWORD = 6

const label: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 500, color: '#444', marginBottom: '6px' }
const input: React.CSSProperties = { width: '100%', border: '1px solid #E0E0E0', borderRadius: '10px', padding: '12px 14px', fontSize: '14px', outline: 'none', background: 'white', boxSizing: 'border-box' }
const readOnly: React.CSSProperties = { ...input, background: '#F5F5F5', color: '#777' }
const card: React.CSSProperties = { background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '24px', marginBottom: '20px' }
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  background: disabled ? '#999' : '#C0392B', color: 'white', border: 'none', borderRadius: '10px',
  padding: '12px 22px', fontSize: '14px', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
})

const errorText = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback

const roleLabel = (user: User) => {
  if (user.role === 'ADMIN') return 'Platform admin'
  if (user.role === 'OPERATOR' && user.staff) return `${STAFF_ROLE_LABEL[user.staff.role]}, ${user.staff.companyName}`
  if (user.role === 'DRIVER') return 'Driver'
  return 'Passenger'
}

const initials = (name: string) => name.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase()

/**
 * One account page for everybody: passengers, managers, sellers, checkers and the admin.
 * The person can change their name and email and their password. The phone number is the
 * login, so it can only be changed by the platform admin for now.
 * A person who was given a temporary password lands here and can do nothing else until
 * they have chosen their own (the server enforces that; this page just makes it easy).
 */
export default function AccountPage() {
  const router = useRouter()
  const { user, setUser, setAuth, logout, loadFromStorage } = useAuthStore()
  const [ready, setReady] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadFromStorage()
    if (!localStorage.getItem('token')) {
      router.replace('/login')
      return
    }
    api
      .get('/auth/me')
      .then((res) => {
        if (cancelled) return
        const fresh = res.data.data.user as User
        setUser(fresh)
        setName(fresh.name)
        setEmail(fresh.email ?? '')
        setReady(true)
      })
      .catch(() => {
        // 401 is handled globally (back to login). Otherwise (slow free server) show what we saved.
        if (cancelled) return
        const saved = useAuthStore.getState().user
        if (saved) { setName(saved.name); setEmail(saved.email ?? ''); setReady(true) }
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!ready || !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F8F8' }}>
        <p style={{ color: '#999' }}>Loading...</p>
      </div>
    )
  }

  const mustChange = !!user.mustChangePassword
  const isPassenger = user.role === 'CUSTOMER'

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const res = await api.patch('/auth/me', { name, email })
      const fresh = res.data.data.user as User
      setUser({ ...user, ...fresh })
      setName(fresh.name)
      setEmail(fresh.email ?? '')
      toast.success('Your details were saved')
    } catch (err) {
      toast.error(errorText(err, 'Could not save your details'))
    } finally {
      setSavingProfile(false)
    }
  }

  const passwordProblem =
    newPassword.length > 0 && newPassword.length < MIN_PASSWORD
      ? `The new password must be at least ${MIN_PASSWORD} characters`
      : confirmPassword.length > 0 && newPassword !== confirmPassword
        ? 'The two new passwords are not the same'
        : ''
  const passwordReady = !!currentPassword && newPassword.length >= MIN_PASSWORD && newPassword === confirmPassword

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordReady) return
    setSavingPassword(true)
    try {
      const res = await api.post('/auth/change-password', { currentPassword, newPassword })
      // This device carries on with the fresh login the server just gave it; every other device is logged out
      setAuth({ ...user, mustChangePassword: false, passwordChangedAt: new Date().toISOString() }, res.data.data.token)
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      toast.success(mustChange ? 'Password saved. Welcome!' : 'Password changed. Your other devices were logged out.')
      if (mustChange) router.push(homeFor(user))
    } catch (err) {
      toast.error(errorText(err, 'Could not change the password'))
    } finally {
      setSavingPassword(false)
    }
  }

  const handleLogout = () => { logout(); router.push('/') }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8' }}>
      {isPassenger && !mustChange ? (
        <Navbar />
      ) : (
        <header style={{ background: '#1A0A0A', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <Link href={mustChange ? '/account' : homeFor(user)} style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <div style={{ width: '30px', height: '30px', background: '#C0392B', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bus size={15} color="white" />
            </div>
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>Mugo<span style={{ color: '#C0392B' }}>Bus</span></span>
          </Link>
          <div style={{ display: 'flex', gap: '8px' }}>
            {!mustChange && (
              <Link href={homeFor(user)} style={{ border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', textDecoration: 'none' }}>
                Back to work
              </Link>
            )}
            <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer' }}>
              <LogOut size={14} /> Logout
            </button>
          </div>
        </header>
      )}

      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '32px 20px 64px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <UserCircle size={24} color="#C0392B" /> My account
        </h1>

        {mustChange && (
          <div role="alert" style={{ background: '#FFFBEB', border: '1px solid #F2D98A', borderRadius: '12px', padding: '16px 18px', marginBottom: '20px', display: 'flex', gap: '12px' }}>
            <ShieldAlert size={20} color="#B7791F" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '14px', color: '#7A5A10', lineHeight: 1.6 }}>
              <strong>Choose your own password to continue.</strong> You are using a temporary password
              that someone else set. Enter it below as the current password, then choose a new one that only you know.
            </div>
          </div>
        )}

        {/* Who I am */}
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#1A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, color: '#D4A017', flexShrink: 0 }}>
            {initials(user.name) || '?'}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a', overflowWrap: 'anywhere' }}>{user.name}</div>
            <div style={{ fontSize: '13px', color: '#777', marginTop: '2px' }}>{roleLabel(user)}</div>
            <div style={{ fontSize: '12px', color: '#aaa', marginTop: '2px' }}>
              Joined {formatDate(user.createdAt as unknown as string)}
              {user.passwordChangedAt ? ` · Password changed ${formatDate(user.passwordChangedAt)}` : ''}
            </div>
          </div>
        </div>

        {/* Details (not while a temporary password is waiting: the server refuses edits until it is replaced) */}
        {!mustChange && (
          <form onSubmit={saveProfile} style={card}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a', marginBottom: '16px' }}>My details</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={label} htmlFor="acc-name">Full name</label>
                <input id="acc-name" style={input} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} />
              </div>
              <div>
                <label style={label} htmlFor="acc-email">Email (optional)</label>
                <input id="acc-email" style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} placeholder="you@example.com" />
              </div>
              <div>
                <label style={label} htmlFor="acc-phone">Phone number</label>
                <input id="acc-phone" style={readOnly} value={user.phone} readOnly />
                <p style={{ fontSize: '12px', color: '#999', marginTop: '6px' }}>
                  Your phone number is your login, so it cannot be edited here.
                  {SITE.supportPhone ? ` To change it, call ${SITE.supportPhone}.` : ' To change it, contact MugoBus support.'}
                </p>
              </div>
            </div>
            <button type="submit" disabled={savingProfile || name.trim().length < 2} style={{ ...primaryBtn(savingProfile || name.trim().length < 2), marginTop: '20px' }}>
              {savingProfile ? 'Saving...' : 'Save details'}
            </button>
          </form>
        )}

        {/* Password */}
        <form onSubmit={savePassword} style={card}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <KeyRound size={16} color="#C0392B" /> {mustChange ? 'Choose your new password' : 'Change my password'}
          </h2>
          <p style={{ fontSize: '12px', color: '#999', marginBottom: '16px' }}>
            {mustChange
              ? 'Use at least 6 characters.'
              : 'Use at least 6 characters. When you change it, you are logged out of your other phones and computers.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={label} htmlFor="acc-current">{mustChange ? 'Temporary password' : 'Current password'}</label>
              <input id="acc-current" style={input} type={showPasswords ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
            </div>
            <div>
              <label style={label} htmlFor="acc-new">New password</label>
              <input id="acc-new" style={input} type={showPasswords ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required minLength={MIN_PASSWORD} maxLength={100} />
            </div>
            <div>
              <label style={label} htmlFor="acc-confirm">Repeat the new password</label>
              <input id="acc-confirm" style={input} type={showPasswords ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#666', cursor: 'pointer' }}>
              <input type="checkbox" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} /> Show passwords
            </label>
          </div>
          {passwordProblem && <p role="status" style={{ fontSize: '13px', color: '#C0392B', marginTop: '12px' }}>{passwordProblem}</p>}
          <button type="submit" disabled={savingPassword || !passwordReady} style={{ ...primaryBtn(savingPassword || !passwordReady), marginTop: '20px' }}>
            {savingPassword ? 'Saving...' : mustChange ? 'Save my password' : 'Change password'}
          </button>
        </form>

        <p style={{ fontSize: '12px', color: '#aaa', textAlign: 'center' }}>
          Forgot your password? Contact {SITE.name} support and an administrator can set a temporary one for you.
        </p>
      </main>
    </div>
  )
}
