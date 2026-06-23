import { describe, it, expect } from 'vitest'
import { nextDate, dueDates, upcomingOccurrences } from './recurring'
import type { RecurringRule, RecurringFreq } from '../db/types'

const DAY = 86_400_000

/** Local-midnight epoch ms for a Y/M(1-12)/D — mirrors how the app stores dates. */
function ms(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getTime()
}
/** epoch ms → "YYYY-MM-DD" for readable assertions. */
function iso(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}
function isoAll(ts: number[]): string[] {
  return ts.map(iso)
}

function rule(over: Partial<RecurringRule> & { freq: RecurringFreq }): RecurringRule {
  return {
    id: 'r',
    accountId: 'a',
    type: 'expense',
    amount: 1000,
    interval: 1,
    startDate: over.nextRunDate ?? ms(2026, 1, 1),
    nextRunDate: ms(2026, 1, 1),
    autoPost: true,
    archived: false,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

describe('nextDate — monthly', () => {
  it('returns the anchor day in the same month when it has not passed', () => {
    expect(iso(nextDate('monthly', 1, 15, ms(2026, 1, 1)))).toBe('2026-01-15')
    expect(iso(nextDate('monthly', 1, 15, ms(2026, 1, 15)))).toBe('2026-01-15') // on/after = inclusive
  })

  it('rolls to next month when the anchor has passed', () => {
    expect(iso(nextDate('monthly', 1, 15, ms(2026, 1, 20)))).toBe('2026-02-15')
  })

  it('clamps a day-31 anchor to the last day of shorter months', () => {
    expect(iso(nextDate('monthly', 1, 31, ms(2026, 2, 1)))).toBe('2026-02-28') // 2026 not leap
    expect(iso(nextDate('monthly', 1, 31, ms(2026, 4, 1)))).toBe('2026-04-30')
    expect(iso(nextDate('monthly', 1, 31, ms(2024, 2, 1)))).toBe('2024-02-29') // leap
  })

  it('uses the interval when the anchor has already passed this month', () => {
    expect(iso(nextDate('monthly', 2, 15, ms(2026, 1, 20)))).toBe('2026-03-15')
  })
})

describe('nextDate — yearly', () => {
  it('returns this year when the anchor day in from-month has not passed', () => {
    expect(iso(nextDate('yearly', 1, 5, ms(2026, 3, 5)))).toBe('2026-03-05')
  })
  it('rolls to next year when passed', () => {
    expect(iso(nextDate('yearly', 1, 5, ms(2026, 3, 6)))).toBe('2027-03-05')
  })
  it('honors interval across years', () => {
    expect(iso(nextDate('yearly', 2, 5, ms(2026, 3, 6)))).toBe('2028-03-05')
  })
})

describe('nextDate — weekly', () => {
  it('returns the first matching weekday on/after from', () => {
    const from = ms(2026, 1, 1)
    for (let target = 0; target < 7; target++) {
      const r = nextDate('weekly', 1, target, from)
      expect(new Date(r).getDay()).toBe(target)
      expect(r).toBeGreaterThanOrEqual(from)
      expect(r - from).toBeLessThan(7 * DAY)
    }
  })
})

describe('dueDates', () => {
  it('is empty when nextRunDate is after upTo', () => {
    expect(dueDates(rule({ freq: 'monthly', nextRunDate: ms(2026, 6, 1) }), ms(2026, 5, 1))).toEqual(
      [],
    )
  })

  it('catches up every missed monthly occurrence (inclusive of upTo)', () => {
    const r = rule({ freq: 'monthly', anchorDay: 15, nextRunDate: ms(2026, 1, 15) })
    expect(isoAll(dueDates(r, ms(2026, 4, 20)))).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
    ])
  })

  it('clamps a day-31 monthly rule across Feb and Apr', () => {
    const r = rule({ freq: 'monthly', anchorDay: 31, nextRunDate: ms(2026, 1, 31) })
    expect(isoAll(dueDates(r, ms(2026, 5, 31)))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ])
  })

  it('spaces occurrences by interval months', () => {
    const r = rule({ freq: 'monthly', interval: 2, anchorDay: 15, nextRunDate: ms(2026, 1, 15) })
    expect(isoAll(dueDates(r, ms(2026, 7, 1)))).toEqual(['2026-01-15', '2026-03-15', '2026-05-15'])
  })

  it('stops at endDate (inclusive)', () => {
    const r = rule({
      freq: 'monthly',
      anchorDay: 15,
      nextRunDate: ms(2026, 1, 15),
      endDate: ms(2026, 3, 20),
    })
    expect(isoAll(dueDates(r, ms(2026, 12, 1)))).toEqual(['2026-01-15', '2026-02-15', '2026-03-15'])
  })

  it('handles weekly spacing by interval weeks', () => {
    const start = nextDate('weekly', 1, 1, ms(2026, 1, 1)) // first Monday in Jan 2026
    const r = rule({ freq: 'weekly', interval: 2, anchorDay: 1, nextRunDate: start })
    const out = dueDates(r, start + 5 * 7 * DAY)
    expect(out).toHaveLength(3) // weeks 0, 2, 4
    expect(out[1] - out[0]).toBe(14 * DAY)
    expect(out[2] - out[1]).toBe(14 * DAY)
  })

  it('restores Feb 29 on leap years for a yearly rule (clamps to 28 otherwise)', () => {
    const r = rule({ freq: 'yearly', anchorDay: 29, nextRunDate: ms(2024, 2, 29) })
    expect(isoAll(dueDates(r, ms(2028, 12, 31)))).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ])
  })

  it('caps runaway generation at 60 occurrences', () => {
    const r = rule({ freq: 'weekly', anchorDay: 1, nextRunDate: ms(2000, 1, 3) })
    expect(dueDates(r, ms(2026, 1, 1)).length).toBe(60)
  })
})

describe('upcomingOccurrences', () => {
  const now = ms(2026, 1, 10)

  it('includes occurrences within the window, sorted soonest first', () => {
    const soon = rule({ freq: 'monthly', anchorDay: 15, nextRunDate: ms(2026, 1, 15) })
    const sooner = rule({ id: 'x', freq: 'monthly', anchorDay: 12, nextRunDate: ms(2026, 1, 12) })
    const out = upcomingOccurrences([soon, sooner], now, 14)
    expect(out.map((u) => u.date)).toEqual([ms(2026, 1, 12), ms(2026, 1, 15)])
    expect(out[0].inDays).toBe(2)
  })

  it('excludes occurrences beyond the window', () => {
    const far = rule({ freq: 'monthly', anchorDay: 15, nextRunDate: ms(2026, 2, 15) })
    expect(upcomingOccurrences([far], now, 14)).toEqual([])
  })

  it('surfaces overdue occurrences with negative inDays', () => {
    const overdue = rule({ freq: 'monthly', anchorDay: 1, nextRunDate: ms(2026, 1, 1) })
    const out = upcomingOccurrences([overdue], now, 14)
    expect(out[0].inDays).toBe(-9)
  })

  it('skips archived rules', () => {
    const archived = rule({ freq: 'monthly', anchorDay: 12, nextRunDate: ms(2026, 1, 12), archived: true })
    expect(upcomingOccurrences([archived], now, 14)).toEqual([])
  })
})
