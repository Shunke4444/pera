import { describe, it, expect } from 'vitest'
import {
  startOfDay,
  toDateInput,
  fromDateInput,
  monthLabel,
  monthKeyOf,
  shiftMonth,
  recentMonths,
} from './dates'

describe('date input round-trip', () => {
  it('toDateInput then fromDateInput lands on local midnight', () => {
    const ms = new Date(2026, 5, 15, 13, 30).getTime()
    const s = toDateInput(ms)
    expect(s).toBe('2026-06-15')
    expect(fromDateInput(s)).toBe(new Date(2026, 5, 15).getTime())
  })

  it('startOfDay strips the time component', () => {
    const ms = new Date(2026, 5, 15, 23, 59, 59).getTime()
    expect(startOfDay(ms)).toBe(new Date(2026, 5, 15).getTime())
  })
})

describe('month helpers', () => {
  it('monthKeyOf formats a Date', () => {
    expect(monthKeyOf(new Date(2026, 0, 9))).toBe('2026-01')
  })

  it('monthLabel humanizes a key', () => {
    expect(monthLabel('2026-06')).toBe('June 2026')
  })

  it('shiftMonth crosses year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-06', 0)).toBe('2026-06')
  })

  it('recentMonths returns oldest-first window ending at the key', () => {
    expect(recentMonths('2026-03', 3)).toEqual(['2026-01', '2026-02', '2026-03'])
  })
})
