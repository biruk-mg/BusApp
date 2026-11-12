export const LOCALES = ['en', 'am', 'om'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'lang'

// Each language is written in its own language, so people can always find theirs
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  am: 'አማርኛ',
  om: 'Afaan Oromoo',
}

export const isLocale = (v: unknown): v is Locale =>
  typeof v === 'string' && (LOCALES as readonly string[]).includes(v)

// Which language to show: the saved choice first, then the browser's language, then English
export function pickLocale(cookieValue: string | undefined | null, acceptLanguage: string | undefined | null): Locale {
  if (isLocale(cookieValue)) return cookieValue
  const first = (acceptLanguage || '').split(',')[0]?.trim().toLowerCase() || ''
  const base = first.split(/[-_;]/)[0]
  // Afaan Oromo is "om" (and sometimes "orm")
  if (base === 'am') return 'am'
  if (base === 'om' || base === 'orm') return 'om'
  return DEFAULT_LOCALE
}
