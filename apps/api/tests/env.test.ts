import { describe, it, expect } from 'vitest'
import { checkEnv } from '../src/lib/env'

const goodSecret = 'x'.repeat(40)

describe('checkEnv', () => {
  it('refuses to start without JWT_SECRET', () => {
    const { errors } = checkEnv({})
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/JWT_SECRET/)
  })

  it('is happy on a developer machine with only a secret', () => {
    expect(checkEnv({ JWT_SECRET: goodSecret, NODE_ENV: 'development' })).toEqual({ errors: [], warnings: [] })
    expect(checkEnv({ JWT_SECRET: goodSecret })).toEqual({ errors: [], warnings: [] })
  })

  it('only warns (does not stop) when the secret is short', () => {
    const { errors, warnings } = checkEnv({ JWT_SECRET: 'short-secret' })
    expect(errors).toEqual([])
    expect(warnings[0]).toMatch(/JWT_SECRET/)
  })

  it('names every missing setting on the live server', () => {
    const { errors } = checkEnv({ NODE_ENV: 'production', JWT_SECRET: goodSecret })
    const text = errors.join('\n')
    for (const name of ['DATABASE_URL', 'CHAPA_SECRET_KEY', 'API_URL', 'FRONTEND_URL']) {
      expect(text).toContain(name)
    }
    expect(errors).toHaveLength(4)
  })

  it('passes on the live server when everything is set', () => {
    const env = {
      NODE_ENV: 'production',
      JWT_SECRET: goodSecret,
      DATABASE_URL: 'postgresql://example',
      CHAPA_SECRET_KEY: 'key',
      API_URL: 'https://api.example.com',
      FRONTEND_URL: 'https://example.com',
    }
    expect(checkEnv(env)).toEqual({ errors: [], warnings: [] })
  })
})
