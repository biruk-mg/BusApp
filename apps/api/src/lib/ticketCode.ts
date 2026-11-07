import { randomInt } from 'crypto'

// No 0/O or 1/I, which are easy to mix up when reading a code aloud
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const TICKET_CODE_LENGTH = 8
export const TICKET_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/

/** A short random code for a counter ticket, e.g. "K7M2QX9D" (32^8, about 1.1 trillion). */
export function generateTicketCode(): string {
  let code = ''
  for (let i = 0; i < TICKET_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}
