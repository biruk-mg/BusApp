/**
 * Ethiopian mobile numbers are typed two ways: 09XXXXXXXX and +2519XXXXXXXX.
 * Accounts keep the number exactly as the person typed it, so to find an
 * account (or compare numbers) we always check both forms.
 */
const ETH_PHONE = /^(?:\+2519|09)(\d{8})$/

/** The canonical form "09XXXXXXXX", or null when it is not a valid mobile number. */
export function normalizePhone(input: string): string | null {
  const m = ETH_PHONE.exec(input.trim().replace(/[\s-]/g, ''))
  return m ? `09${m[1]}` : null
}

/** Both written forms of a canonical number, for database lookups. */
export function phoneVariants(canonical: string): string[] {
  return [canonical, `+251${canonical.slice(1)}`]
}
