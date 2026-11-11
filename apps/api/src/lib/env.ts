/**
 * Checks the server's settings (environment variables) when it starts, so a missing
 * one stops the server with a clear message instead of causing random 500 errors
 * later (for example, a login that fails because JWT_SECRET is empty).
 */
export interface EnvCheck {
  /** The server must not start. */
  errors: string[]
  /** The server starts, but someone should look at these. */
  warnings: string[]
}

export function checkEnv(env: NodeJS.ProcessEnv = process.env): EnvCheck {
  const errors: string[] = []
  const warnings: string[] = []
  const production = env.NODE_ENV === 'production'

  if (!env.JWT_SECRET) {
    errors.push('JWT_SECRET is missing (logins cannot work without it)')
  } else if (env.JWT_SECRET.length < 32) {
    warnings.push('JWT_SECRET is short: use at least 32 random characters')
  }

  if (production) {
    // Locally the database falls back to a default; on the live server it must be set
    for (const name of ['DATABASE_URL', 'CHAPA_SECRET_KEY', 'API_URL', 'FRONTEND_URL']) {
      if (!env[name]) errors.push(`${name} is missing`)
    }
  }
  return { errors, warnings }
}

/** Call once at startup. Stops the process when something required is missing. */
export function assertEnv(env: NodeJS.ProcessEnv = process.env): void {
  const { errors, warnings } = checkEnv(env)
  for (const w of warnings) console.warn(`⚠️  ${w}`)
  if (errors.length > 0) {
    console.error('❌ The server was not started because of missing settings:')
    for (const e of errors) console.error(`   - ${e}`)
    process.exit(1)
  }
}
