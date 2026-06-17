import { describe, it, expect } from 'vitest'
import { parseStatementLines, profileById, PDF_PROFILES } from './pdfProfiles'
import { startOfDay } from './dates'

describe('parseStatementLines', () => {
  it('parses a GCash-style expense line (date + amount, debit keyword)', () => {
    const rows = parseStatementLines(['2026-06-15 Payment to Jollibee 1,500.00 8,920.00'], {
      defaultDirection: 'expense',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe(startOfDay(new Date(2026, 5, 15).getTime()))
    expect(rows[0].amount).toBe(-150000)
    expect(rows[0].type).toBe('expense')
    expect(rows[0].description).toContain('Jollibee')
  })

  it('detects income from a credit keyword', () => {
    const rows = parseStatementLines(['2026-06-16 Cash In from BPI 5,000.00 13,920.00'])
    expect(rows[0].type).toBe('income')
    expect(rows[0].amount).toBe(500000)
  })

  it('skips lines without a date or amount', () => {
    const rows = parseStatementLines([
      'Statement of Account',
      'Opening balance 1,000.00',
      '2026-06-17 Send Money to Juan 250.00 13,670.00',
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(-25000)
  })

  it('honors the default direction when no keyword matches', () => {
    const rows = parseStatementLines(['06/18/2026 Some Merchant 99.00'], {
      defaultDirection: 'expense',
    })
    expect(rows[0].type).toBe('expense')
  })
})

describe('profile registry', () => {
  it('marks GCash as password protected', () => {
    expect(profileById('gcash').passwordProtected).toBe(true)
  })
  it('falls back to the generic profile for unknown ids', () => {
    expect(profileById('nope').id).toBe('generic')
  })
  it('exposes GCash and Maya profiles', () => {
    const ids = PDF_PROFILES.map((p) => p.id)
    expect(ids).toContain('gcash')
    expect(ids).toContain('maya')
  })
})
