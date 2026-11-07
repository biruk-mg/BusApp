'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { homeFor } from '@/lib/staffHome'
import type { User } from '@bus/types'

export type Allowed = 'ADMIN' | 'MANAGER' | 'SELLER' | 'CHECKER'

const kindOf = (user: User): Allowed | null =>
  user.role === 'ADMIN' ? 'ADMIN' : user.role === 'OPERATOR' && user.staff ? user.staff.role : null

/**
 * Protects a staff page. It asks the server who the person is NOW (their role may
 * have changed since they logged in) and sends them to their own home page if
 * this page is not for them. The server enforces the real permissions; this only
 * keeps the screens and menus right.
 */
export function useStaffGuard(allowed: Allowed[]) {
  const router = useRouter()
  const { user, loadFromStorage, setUser, logout } = useAuthStore()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const decide = (current: User) => {
      const kind = kindOf(current)
      if (kind && allowed.includes(kind)) setReady(true)
      else router.replace(homeFor(current))
    }

    loadFromStorage()
    const token = localStorage.getItem('token')
    const saved = localStorage.getItem('user')
    if (!token || !saved) {
      router.replace('/login')
      return
    }

    api
      .get('/auth/me')
      .then((res) => {
        if (cancelled) return
        const fresh = res.data.data.user as User
        setUser(fresh)
        decide(fresh)
      })
      .catch((error) => {
        if (cancelled) return
        // 401 is handled globally (back to login). On a network problem or a slow
        // free server, fall back to what we saved instead of locking the person out.
        if (error?.response?.status === 401) return
        try { decide(JSON.parse(saved) as User) } catch { logout(); router.replace('/login') }
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ready, user }
}
