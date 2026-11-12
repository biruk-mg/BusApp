'use client'

import { Globe } from 'lucide-react'
import { LOCALES, LOCALE_NAMES, isLocale } from '@/i18n/config'
import { useI18n } from '@/i18n/LanguageProvider'

// A plain select: easy to use on phones, and each language is written in itself
export default function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const { locale, setLocale, t } = useI18n()
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: dark ? 'rgba(255,255,255,0.5)' : '#666' }}>
      <Globe size={14} aria-hidden="true" />
      <select
        aria-label={t('common.language')}
        value={locale}
        onChange={(e) => { if (isLocale(e.target.value)) setLocale(e.target.value) }}
        style={{
          border: `1px solid ${dark ? 'rgba(255,255,255,0.2)' : '#E0E0E0'}`, borderRadius: '8px', padding: '6px 8px', fontSize: '13px',
          background: dark ? 'transparent' : '#fff', color: dark ? 'rgba(255,255,255,0.75)' : '#444', cursor: 'pointer',
        }}
      >
        {LOCALES.map((l) => <option key={l} value={l} style={{ color: '#1a1a1a' }}>{LOCALE_NAMES[l]}</option>)}
      </select>
    </label>
  )
}
