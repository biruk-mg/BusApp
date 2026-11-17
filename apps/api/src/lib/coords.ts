// Reading a map location that a manager pasted into the pickup-point form.
// No Google key is needed: the manager copies the numbers (or the long link) from Google Maps.
//
// Understood:
//   9.0301, 38.7400                       (what Google Maps shows when you tap or click a spot)
//   9.0301 38.7400
//   https://www.google.com/maps/@9.0301,38.7400,17z
//   https://www.google.com/maps/place/Megenagna/@9.0301,38.7400,17z/data=...!3d9.0302!4d38.7401
//   https://www.google.com/maps?q=9.0301,38.7400      (also ll=, query=, destination=)
// Not understood: short links (maps.app.goo.gl, goo.gl/maps), because the numbers are not in
// them, and degrees-minutes-seconds such as 9°1'48"N.

export type CoordsResult = { ok: true; lat: number; lng: number } | { ok: false; error: string }

// The service runs in Ethiopia, with routes that can cross a border. This wide box around East
// Africa only exists to catch a typo or latitude and longitude typed the wrong way round.
const LAT_RANGE: [number, number] = [-5, 20]
const LNG_RANGE: [number, number] = [28, 52]

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)'
const PAIR = `${NUM}\\s*[, ]\\s*${NUM}`

const PLACE_DATA = new RegExp(`!3d${NUM}!4d${NUM}`) // the exact pin of a place link
const AT_VIEW = new RegExp(`@${PAIR}`) // the centre of the map view
const QUERY = new RegExp(`[?&](?:q|ll|query|destination|center)=${NUM}(?:,|%2C)\\s*${NUM}`, 'i')
const PLAIN = new RegExp(`^\\s*${PAIR}\\s*$`)

const SHORT_LINK = /(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

const pick = (m: RegExpMatchArray | null): [number, number] | null => (m ? [Number(m[1]), Number(m[2])] : null)

export function parseLocationInput(input: string): CoordsResult {
  const text = input.trim()
  if (!text) return { ok: false, error: 'Paste the coordinates or a Google Maps link' }

  if (SHORT_LINK.test(text)) {
    return {
      ok: false,
      error:
        'Short Google Maps links cannot be read. Open the link, then copy the two numbers (like 9.0301, 38.7400) or the long address from the browser bar.',
    }
  }

  // A Google link can hold both the pin and the view centre: the pin is the better one.
  let found = pick(text.match(PLACE_DATA)) ?? pick(text.match(AT_VIEW)) ?? pick(text.match(QUERY)) ?? pick(text.match(PLAIN))

  if (!found) {
    // A link may also carry the numbers URL-encoded
    let decoded = text
    try {
      decoded = decodeURIComponent(text)
    } catch {
      /* keep the original text */
    }
    if (decoded !== text) {
      found = pick(decoded.match(PLACE_DATA)) ?? pick(decoded.match(AT_VIEW)) ?? pick(decoded.match(QUERY)) ?? pick(decoded.match(PLAIN))
    }
  }

  if (!found) {
    return {
      ok: false,
      error: 'Could not find coordinates. Use two numbers like 9.0301, 38.7400 (latitude first), or a full Google Maps link.',
    }
  }

  const [lat, lng] = found
  if (lat < LAT_RANGE[0] || lat > LAT_RANGE[1] || lng < LNG_RANGE[0] || lng > LNG_RANGE[1]) {
    return {
      ok: false,
      error: 'These coordinates are outside Ethiopia and its neighbours. Check the numbers, and that latitude (about 9) comes first.',
    }
  }
  return { ok: true, lat: round6(lat), lng: round6(lng) }
}
