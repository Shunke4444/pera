import { describe, it, expect } from 'vitest'
import { budgetLevel, rolloverCarry, budgetStatus } from './budgets'

describe('budgetLevel', () => {
  it('is ok below 80%', () => {
    expect(budgetLevel(0)).toBe('ok')
    expect(budgetLevel(79.9)).toBe('ok')
  })
  it('warns from 80 to 100%', () => {
    expect(budgetLevel(80)).toBe('warn')
    expect(budgetLevel(100)).toBe('warn')
  })
  it('is over above 100%', () => {
    expect(budgetLevel(100.1)).toBe('over')
  })
})

describe('rolloverCarry', () => {
  it('carries positive leftover', () => {
    expect(rolloverCarry(500000, 300000)).toBe(200000)
  })
  it('never carries a negative (overspent prior month)', () => {
    expect(rolloverCarry(500000, 600000)).toBe(0)
  })
})

describe('budgetStatus', () => {
  it('computes remaining and percent against the limit', () => {
    const s = budgetStatus(500000, 400000)
    expect(s.limit).toBe(500000)
    expect(s.remaining).toBe(100000)
    expect(s.pct).toBe(80)
    expect(s.level).toBe('warn')
  })

  it('goes negative and over when spending exceeds the limit', () => {
    const s = budgetStatus(100000, 150000)
    expect(s.remaining).toBe(-50000)
    expect(s.pct).toBe(150)
    expect(s.level).toBe('over')
  })

  it('adds rollover carry to the effective limit', () => {
    const s = budgetStatus(100000, 100000, 50000)
    expect(s.limit).toBe(150000)
    expect(s.remaining).toBe(50000)
    expect(s.level).toBe('ok') // 100k / 150k = 66.7%
  })

  it('treats a zero limit with spend as over', () => {
    expect(budgetStatus(0, 1000).level).toBe('over')
    expect(budgetStatus(0, 0).level).toBe('ok')
  })
})
