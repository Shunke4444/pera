import { describe, it, expect } from 'vitest'
import { goalStats, monthsToGoal, monthlyRate } from './goals'

describe('goalStats', () => {
  it('computes percent and remaining', () => {
    const s = goalStats(100000, 42000)
    expect(s.pct).toBeCloseTo(42)
    expect(s.remaining).toBe(58000)
    expect(s.complete).toBe(false)
  })

  it('clamps percent and remaining when over-saved', () => {
    const s = goalStats(100000, 120000)
    expect(s.pct).toBe(100)
    expect(s.remaining).toBe(0)
    expect(s.complete).toBe(true)
  })

  it('handles a zero target', () => {
    expect(goalStats(0, 0).pct).toBe(0)
    expect(goalStats(0, 100).complete).toBe(false)
  })
})

describe('monthsToGoal', () => {
  it('divides remaining by the monthly rate, rounding up', () => {
    expect(monthsToGoal(58000, 10000)).toBe(6)
  })
  it('is 0 when nothing remains', () => {
    expect(monthsToGoal(0, 10000)).toBe(0)
  })
  it('is null when the rate is non-positive', () => {
    expect(monthsToGoal(58000, 0)).toBeNull()
  })
})

describe('monthlyRate', () => {
  it('is zero with nothing saved', () => {
    expect(monthlyRate(0, 0, 1000)).toBe(0)
  })
  it('approximates a steady rate over several months', () => {
    const start = new Date(2026, 0, 1).getTime()
    const now = new Date(2026, 3, 1).getTime() // ~3 months later
    const rate = monthlyRate(30000, start, now) // 30000 over ~3 months
    expect(rate).toBeGreaterThan(8000)
    expect(rate).toBeLessThan(12000)
  })
})
