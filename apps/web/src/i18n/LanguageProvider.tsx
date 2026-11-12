'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './config'
import { translate, translatePlural, type MessageKey, type PluralKey, type Vars } from './translate'
import { cityName } from './cities'
import {
  formatTime, formatDateLong, formatDateShort, ethiopianDate, formatPrice, formatDuration, formatNext, busTypeName,
} from './format'

export interface I18n {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: MessageKey, vars?: Vars) => string
  tn: (base: PluralKey, n: number, vars?: Vars) => string
  city: (name: string) => string
  time: (d: Date | string) => string
  dateLong: (d: Date | string) => string
  dateShort: (d: Date | string) => string
  ethiopianDate: (d: Date | string) => string
  price: (amount: number) => string
  duration: (minutes: number) => string
  next: (iso: string) => string
  busType: (type: string) => string
}

function build(locale: Locale, setLocale: (l: Locale) => void): I18n {
  return {
    locale,
    setLocale,
    t: (key, vars) => translate(locale, key, vars),
    tn: (base, n, vars) => translatePlural(locale, base, n, vars),
    city: (name) => cityName(locale, name),
    time: (d) => formatTime(locale, d),
    dateLong: (d) => formatDateLong(locale, d),
    dateShort: (d) => formatDateShort(locale, d),
    ethiopianDate,
    price: (amount) => formatPrice(locale, amount),
    duration: (minutes) => formatDuration(locale, minutes),
    next: (iso) => formatNext(locale, iso),
    busType: (type) => busTypeName(locale, type),
  }
}

// Without a provider (for example in a test) the screens simply show English
const Ctx = createContext<I18n>(build(DEFAULT_LOCALE, () => {}))

export function LanguageProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const router = useRouter()
  const [locale, setLocaleState] = useState<Locale>(isLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE)

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return
    // Remember the choice for a year. The server reads this cookie too, so pages
    // rendered on the server (like the Help Center) use the same language.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`
    document.documentElement.lang = next
    setLocaleState(next)
    router.refresh()
  }, [router])

  const value = useMemo(() => build(locale, setLocale), [locale, setLocale])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useI18n = () => useContext(Ctx)
