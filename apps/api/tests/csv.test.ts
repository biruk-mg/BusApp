import { describe, it, expect } from 'vitest'
import { birr, csvCell, toCsv } from '../src/lib/csv'

describe('csv', () => {
  it('starts with a byte-order mark (so Excel reads Amharic) and uses Windows line ends', () => {
    const out = toCsv([['a', 'b'], ['ሰላም', 1]])
    expect(out.startsWith('\uFEFF')).toBe(true)
    expect(out).toBe('\uFEFFa,b\r\nሰላም,1\r\n')
  })
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })
  it('stops text from being run as a spreadsheet formula', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`)
    for (const bad of ['+1+1', '-2+3', '@SUM(A1)', '\tcmd', '\rcmd']) expect(csvCell(bad).replace(/^"/, '').startsWith("'")).toBe(true)
  })
  it('writes amounts with two decimals and never mangles a negative amount', () => {
    expect(csvCell(birr(1234.5))).toBe('1234.50')
    expect(csvCell(birr(-75))).toBe('-75.00')
    expect(csvCell(birr(0.1 + 0.2))).toBe('0.30')
  })
  it('leaves plain numbers, blanks and normal text alone', () => {
    expect(csvCell(7)).toBe('7')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell('Selam Bus')).toBe('Selam Bus')
  })
})
