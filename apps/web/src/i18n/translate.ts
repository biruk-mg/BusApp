import { en, type MessageKey } from './messages/en'
import { am } from './messages/am'
import { om } from './messages/om'
import type { Locale } from './config'

const CATALOGS: Record<Locale, Record<MessageKey, string>> = { en, am, om }

export type Vars = Record<string, string | number>
export type { MessageKey }

// Keys that come in a "one" and an "other" form (for counts), by their shared start
export type PluralKey = MessageKey extends infer K ? (K extends `${infer B}.one` ? B : never) : never

const interpolate = (text: string, vars?: Vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : text

// A missing text falls back to English (and never to an empty box)
export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const text = CATALOGS[locale]?.[key] || en[key] || key
  return interpolate(text, vars)
}

export function translatePlural(locale: Locale, base: PluralKey, n: number, vars?: Vars): string {
  const key = `${base}.${n === 1 ? 'one' : 'other'}` as MessageKey
  return translate(locale, key, { n, ...vars })
}

export const hasMessage = (key: string): key is MessageKey => key in en
