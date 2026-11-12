import { cookies, headers } from 'next/headers'
import { LOCALE_COOKIE, pickLocale, type Locale } from './config'
import { translate, translatePlural, type MessageKey, type PluralKey, type Vars } from './translate'

// For pages rendered on the server
export async function getLocale(): Promise<Locale> {
  const [jar, hdrs] = await Promise.all([cookies(), headers()])
  return pickLocale(jar.get(LOCALE_COOKIE)?.value, hdrs.get('accept-language'))
}

export async function getT() {
  const locale = await getLocale()
  return {
    locale,
    t: (key: MessageKey, vars?: Vars) => translate(locale, key, vars),
    tn: (base: PluralKey, n: number, vars?: Vars) => translatePlural(locale, base, n, vars),
  }
}
