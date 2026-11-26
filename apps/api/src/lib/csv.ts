/**
 * CSV for spreadsheets (Excel, Google Sheets).
 *
 * - A byte-order mark first, so Excel reads Amharic and other non-English text correctly.
 * - Text that starts with = + - @ (or a tab / carriage return) is shown with a leading ' so a
 *   spreadsheet never runs it as a formula (CSV injection). Names and notes in this app are typed
 *   by people, so they must never be trusted to be harmless.
 * - Amounts are written with exactly two decimals, and are never touched by the rule above.
 */
export interface Birr {
  birr: number
}
/** Marks a number as an amount in birr: written as 1234.50 */
export const birr = (value: number): Birr => ({ birr: value })

export type CsvValue = string | number | Birr | null | undefined

const FORMULA_START = /^[=+\-@\t\r]/

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return value.birr.toFixed(2)
  if (typeof value === 'number') return String(value)
  const text = FORMULA_START.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const toCsv = (rows: CsvValue[][]): string =>
  '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
