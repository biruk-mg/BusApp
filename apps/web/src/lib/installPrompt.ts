// When to ask a passenger to put MugoBus on the home screen. Plain functions, no browser objects.

export interface PromptMemory {
  dismissedAt: number | null // when "Not now" was last tapped
  dismissCount: number
  installed: boolean
}

export const EMPTY_MEMORY: PromptMemory = { dismissedAt: null, dismissCount: 0, installed: false }
export const SNOOZE_MS = 7 * 24 * 3600_000 // after "Not now", ask again in a week
export const MAX_DISMISSALS = 3 // after the third "Not now", never again

/** Reads what the browser stored. Anything strange gives a fresh memory instead of an error. */
export function parseMemory(raw: string | null): PromptMemory {
  if (!raw) return EMPTY_MEMORY
  try {
    const v = JSON.parse(raw) as Partial<PromptMemory>
    return {
      dismissedAt: typeof v.dismissedAt === 'number' ? v.dismissedAt : null,
      dismissCount: typeof v.dismissCount === 'number' && v.dismissCount >= 0 ? Math.floor(v.dismissCount) : 0,
      installed: v.installed === true,
    }
  } catch {
    return EMPTY_MEMORY
  }
}

export const recordDismissal = (m: PromptMemory, now: number): PromptMemory => ({ ...m, dismissedAt: now, dismissCount: m.dismissCount + 1 })
export const recordInstalled = (m: PromptMemory): PromptMemory => ({ ...m, installed: true })

/** iPhone and iPad (an iPad can call itself a Mac, so touch points are checked too). */
export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iphone|ipad|ipod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)
}

/** Facebook, Instagram, TikTok, Telegram, Line: a page opened from them cannot be installed. */
export function isInAppBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|musical_ly|TikTok|Telegram|Line\//i.test(userAgent)
}

// Only where a passenger browses: never in the middle of seat choosing or payment, never on staff screens
const PROMPT_PATHS = ['/search', '/routes', '/bookings', '/account']
export const isPromptPath = (path: string) => path === '/' || PROMPT_PATHS.some((p) => path === p || path.startsWith(p + '/'))

export function shouldShowInstallPrompt(input: {
  standalone: boolean // already opened from the home screen
  touch: boolean // a phone or tablet, not a computer
  inApp: boolean
  ios: boolean
  canInstall: boolean // the browser offered its own install prompt (Android Chrome and similar)
  memory: PromptMemory
  now: number
  path: string
}): boolean {
  if (input.standalone || !input.touch || input.inApp || input.memory.installed) return false
  if (!input.canInstall && !input.ios) return false
  if (input.memory.dismissCount >= MAX_DISMISSALS) return false
  if (input.memory.dismissedAt !== null && input.now - input.memory.dismissedAt < SNOOZE_MS) return false
  return isPromptPath(input.path)
}
