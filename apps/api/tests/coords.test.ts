import { describe, it, expect } from 'vitest'
import { parseLocationInput } from '../src/lib/coords'

const ok = (lat: number, lng: number) => ({ ok: true, lat, lng })

describe('reading a pasted map location', () => {
  it('reads two plain numbers, latitude first', () => {
    expect(parseLocationInput('9.0301, 38.7400')).toEqual(ok(9.0301, 38.74))
    expect(parseLocationInput('9.0301,38.7400')).toEqual(ok(9.0301, 38.74))
    expect(parseLocationInput('  9.0301 38.7400  ')).toEqual(ok(9.0301, 38.74))
    expect(parseLocationInput('9, 38')).toEqual(ok(9, 38))
  })

  it('reads the map view in a Google Maps link', () => {
    expect(parseLocationInput('https://www.google.com/maps/@9.0301,38.7400,17z')).toEqual(ok(9.0301, 38.74))
  })

  it('prefers the exact pin of a place link over the map centre', () => {
    const url =
      'https://www.google.com/maps/place/Megenagna/@9.0350,38.7500,17z/data=!3m1!4b1!4m6!3m5!1s0x1:0x2!8m2!3d9.0302!4d38.7401'
    expect(parseLocationInput(url)).toEqual(ok(9.0302, 38.7401))
  })

  it('reads q=, ll= and query= links', () => {
    expect(parseLocationInput('https://www.google.com/maps?q=9.0301,38.7400')).toEqual(ok(9.0301, 38.74))
    expect(parseLocationInput('https://maps.google.com/?ll=9.0301,38.7400&z=15')).toEqual(ok(9.0301, 38.74))
    expect(parseLocationInput('https://www.google.com/maps/search/?api=1&query=9.0301%2C38.7400')).toEqual(ok(9.0301, 38.74))
  })

  it('rounds to 6 decimals (about 10 cm)', () => {
    expect(parseLocationInput('9.03012345678, 38.74009876543')).toEqual(ok(9.030123, 38.740099))
  })

  it('says why a short link cannot be read', () => {
    const r = parseLocationInput('https://maps.app.goo.gl/AbCdEf123')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Short Google Maps links/)
  })

  it('catches latitude and longitude typed the wrong way round', () => {
    const r = parseLocationInput('38.7400, 9.0301')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/latitude/i)
  })

  it('rejects places far outside the region and impossible numbers', () => {
    expect(parseLocationInput('51.5074, -0.1278').ok).toBe(false) // London
    expect(parseLocationInput('99.0, 38.7').ok).toBe(false)
    expect(parseLocationInput('9.0301, 380.7').ok).toBe(false)
  })

  it('rejects empty text and text without numbers', () => {
    expect(parseLocationInput('').ok).toBe(false)
    expect(parseLocationInput('   ').ok).toBe(false)
    expect(parseLocationInput('near Megenagna bus stop').ok).toBe(false)
    expect(parseLocationInput('https://www.google.com/maps/place/Megenagna').ok).toBe(false)
  })

  it('accepts a border-area point (Moyale, Ethiopia/Kenya)', () => {
    expect(parseLocationInput('3.5230, 39.0540')).toEqual(ok(3.523, 39.054))
  })
})
