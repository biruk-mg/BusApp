import { z } from 'zod'

/** The shortest password allowed. Kept at 6 on purpose (the owner's decision), the same as sign-up. */
export const PASSWORD_MIN = 6
export const PASSWORD_MAX = 100

export const passwordRule = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters`)

/**
 * What to write when the admin or a manager SETS someone's password (a temporary one):
 * the person must choose their own at the next login, and every login they already
 * have (on any device) stops working.
 */
export const temporaryPasswordUpdate = (hashed: string) => ({
  password: hashed,
  mustChangePassword: true,
  tokenVersion: { increment: 1 },
  passwordChangedAt: new Date(),
})

/** The same, for a brand new account that is created with a temporary password. */
export const temporaryPasswordCreate = (hashed: string) => ({
  password: hashed,
  mustChangePassword: true,
  passwordChangedAt: new Date(),
})
