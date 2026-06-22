import { describe, it, expect } from 'vitest'
import {
  parseStatementLines,
  parseAubLines,
  parseMaribankLines,
  profileById,
  PDF_PROFILES,
} from './pdfProfiles'
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

// All fixtures below use placeholder names/amounts — never real statement data.
describe('parseAubLines (AUB HelloMoney)', () => {
  // Stacked layout: pdfjs emits each field on its own y-grouped line, date first.
  const aubStacked = [
    'Transaction History', // header noise — must not become a row
    '06/22/2026 10:35 am',
    'JUAN DELA CRUZ/MARIBANK',
    'Transfer Money (InstaPay)',
    '- 7,492.00',
    '8.90', // running balance, unsigned
    '06/21/2026 8:00 am',
    'Payroll Credit',
    '+ 7,500.24',
    '7,500.90',
    '06/20/2026 1:15 pm',
    'SOME BILLER',
    'Transfer Money Fee',
    '- 15.00',
    '0.66',
  ]

  it('parses income, expense (transfer) and fee rows with signed minor amounts', () => {
    const rows = parseAubLines(aubStacked)
    expect(rows).toHaveLength(3)

    expect(rows[0].date).toBe(startOfDay(new Date(2026, 5, 22).getTime()))
    expect(rows[0].amount).toBe(-749200)
    expect(rows[0].type).toBe('expense')
    expect(rows[0].description).toContain('JUAN DELA CRUZ')
    expect(rows[0].description).toContain('InstaPay')

    expect(rows[1].amount).toBe(750024)
    expect(rows[1].type).toBe('income')
    expect(rows[1].description).toContain('Payroll Credit')

    expect(rows[2].amount).toBe(-1500)
    expect(rows[2].type).toBe('expense')
    expect(rows[2].description).toContain('Fee')
  })

  it('disambiguates amount from running balance on a single joined line', () => {
    const rows = parseAubLines([
      '06/22/2026 10:35 am JUAN DELA CRUZ Transfer Money - 7,492.00 8.90',
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(-749200) // the signed token, NOT the 8.90 balance
    expect(rows[0].description).not.toContain('7,492')
    expect(rows[0].description).not.toContain('8.90')
  })
})

describe('parseMaribankLines (Maribank)', () => {
  // Stacked layout: title + type label come BEFORE the datetime on screen.
  const mariStacked = [
    'eStatement', // header noise
    'MCDONALDS 794 CGS',
    'Transfer',
    '05 Jun 2026, 13:27',
    '-PHP 319.00',
    'Savings Interest',
    'Interest',
    '03 Jun 2026, 09:00',
    '+PHP 2.00',
    'Ri****E A.',
    'Transfer',
    '02 Jun 2026, 18:40',
    '-PHP 1,234.00',
    'Transaction Cashback',
    'Reward',
    '01 Jun 2026, 10:00',
    '+PHP 12.50',
  ]

  it('parses interest/reward income and merchant/person expense with PHP-signed amounts', () => {
    const rows = parseMaribankLines(mariStacked)
    expect(rows).toHaveLength(4)

    expect(rows[0].date).toBe(startOfDay(new Date(2026, 5, 5).getTime()))
    expect(rows[0].amount).toBe(-31900)
    expect(rows[0].type).toBe('expense')
    expect(rows[0].description).toContain('MCDONALDS')

    expect(rows[1].amount).toBe(200)
    expect(rows[1].type).toBe('income')
    expect(rows[1].description).toContain('Interest')

    expect(rows[2].amount).toBe(-123400)
    expect(rows[2].type).toBe('expense')
    expect(rows[2].description).toContain('Ri****E') // masked person → default expense

    expect(rows[3].amount).toBe(1250)
    expect(rows[3].type).toBe('income')
    expect(rows[3].description).toContain('Cashback')
  })

  it('groups a title-before-date row correctly on a single joined line', () => {
    const rows = parseMaribankLines(['MCDONALDS 794 Transfer 05 Jun 2026, 13:27 -PHP 319.00'])
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(-31900)
    expect(rows[0].description).toContain('MCDONALDS')
    expect(rows[0].description).not.toContain('319')
  })
})

describe('profile registry', () => {
  it('marks GCash as password protected', () => {
    expect(profileById('gcash').passwordProtected).toBe(true)
  })
  it('marks AUB HelloMoney as password protected (reuses the GCash password flow)', () => {
    expect(profileById('aub').passwordProtected).toBe(true)
  })
  it('falls back to the generic profile for unknown ids', () => {
    expect(profileById('nope').id).toBe('generic')
  })
  it('exposes GCash, Maya, Maribank and AUB profiles', () => {
    const ids = PDF_PROFILES.map((p) => p.id)
    expect(ids).toContain('gcash')
    expect(ids).toContain('maya')
    expect(ids).toContain('maribank')
    expect(ids).toContain('aub')
  })
})
