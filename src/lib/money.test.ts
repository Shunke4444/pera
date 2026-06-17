import { describe, it, expect } from 'vitest'
import {
  toMinor,
  fromMinor,
  formatPHP,
  formatSignedPHP,
  formatCompactPHP,
  parseMajorInput,
} from './money'

describe('toMinor', () => {
  it('converts whole pesos to centavos', () => {
    expect(toMinor(1234)).toBe(123400)
  })

  it('converts pesos with centavos to integer minor units', () => {
    expect(toMinor(1234.5)).toBe(123450)
  })

  it('rounds float artifacts to the nearest centavo', () => {
    // 19.99 * 100 = 1998.9999999999998 in IEEE-754; must round to 1999.
    expect(toMinor(19.99)).toBe(1999)
    expect(toMinor(0.1 + 0.2)).toBe(30)
  })

  it('handles negatives', () => {
    expect(toMinor(-50.25)).toBe(-5025)
  })

  it('treats zero as zero', () => {
    expect(toMinor(0)).toBe(0)
  })
})

describe('fromMinor', () => {
  it('converts minor units back to a peso number', () => {
    expect(fromMinor(123450)).toBe(1234.5)
  })

  it('round-trips with toMinor', () => {
    expect(fromMinor(toMinor(19.99))).toBe(19.99)
  })
})

describe('formatPHP', () => {
  it('formats minor units as a PHP currency string', () => {
    expect(formatPHP(123450)).toBe('₱1,234.50')
  })

  it('formats zero', () => {
    expect(formatPHP(0)).toBe('₱0.00')
  })

  it('signs negative amounts', () => {
    expect(formatPHP(-5025)).toBe('-₱50.25')
  })
})

describe('formatSignedPHP', () => {
  it('prefixes a plus for income', () => {
    expect(formatSignedPHP(50000)).toBe('+₱500.00')
  })
  it('prefixes a minus for expense', () => {
    expect(formatSignedPHP(-50000)).toBe('−₱500.00')
  })
  it('leaves zero unsigned', () => {
    expect(formatSignedPHP(0)).toBe('₱0.00')
  })
})

describe('formatCompactPHP', () => {
  it('keeps full precision below ₱1M', () => {
    expect(formatCompactPHP(123450)).toBe(formatPHP(123450))
    expect(formatCompactPHP(99_999_999)).toBe(formatPHP(99_999_999))
  })

  it('scales values at/above ₱1M so they never overflow', () => {
    const big = 123_456_789_00 // ₱123,456,789.00
    const compact = formatCompactPHP(big)
    expect(compact.length).toBeLessThan(formatPHP(big).length)
    expect(compact.length).toBeLessThanOrEqual(10)
  })

  it('handles huge negatives without exploding length', () => {
    expect(formatCompactPHP(-500_000_000_00).length).toBeLessThanOrEqual(11)
  })
})

describe('parseMajorInput', () => {
  it('parses plain pesos into minor units', () => {
    expect(parseMajorInput('1234.5')).toBe(123450)
  })
  it('strips currency symbol, commas and spaces', () => {
    expect(parseMajorInput('₱ 1,234.50')).toBe(123450)
  })
  it('parses negatives', () => {
    expect(parseMajorInput('-50.25')).toBe(-5025)
  })
  it('returns null for empty or garbage', () => {
    expect(parseMajorInput('')).toBeNull()
    expect(parseMajorInput('  ')).toBeNull()
    expect(parseMajorInput('abc')).toBeNull()
    expect(parseMajorInput('-')).toBeNull()
  })
})
