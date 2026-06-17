import { describe, it, expect } from 'vitest'
import {
  normalizeDesc,
  importHash,
  parseDateCell,
  parseAmountCell,
  parseMatrix,
  dedupeRows,
  type ColumnMapping,
} from './importing'
import { startOfDay } from './dates'

describe('normalizeDesc', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeDesc('  Jollibee   SM   North ')).toBe('jollibee sm north')
  })
})

describe('importHash', () => {
  it('is stable for the same logical transaction', () => {
    const d = new Date(2026, 5, 15, 9, 30).getTime()
    const d2 = new Date(2026, 5, 15, 18, 0).getTime() // same day, different time
    expect(importHash('gcash', d, -1500, 'Jollibee')).toBe(
      importHash('gcash', d2, -1500, 'jollibee'),
    )
  })
  it('differs when amount or account differ', () => {
    const d = new Date(2026, 5, 15).getTime()
    expect(importHash('gcash', d, -1500, 'x')).not.toBe(importHash('gcash', d, -1600, 'x'))
    expect(importHash('gcash', d, -1500, 'x')).not.toBe(importHash('maya', d, -1500, 'x'))
  })
})

describe('parseDateCell', () => {
  it('parses ISO strings', () => {
    expect(parseDateCell('2026-06-15')).toBe(startOfDay(new Date(2026, 5, 15).getTime()))
  })
  it('parses day-first when the first group exceeds 12', () => {
    expect(parseDateCell('15/06/2026')).toBe(startOfDay(new Date(2026, 5, 15).getTime()))
  })
  it('parses an Excel serial number', () => {
    // 46157 = 2026-05-15 (approx); just assert it lands in 2026
    const ms = parseDateCell(46157)
    expect(new Date(ms!).getFullYear()).toBe(2026)
  })
  it('returns null for junk', () => {
    expect(parseDateCell('not a date')).toBeNull()
    expect(parseDateCell('')).toBeNull()
  })
})

describe('parseAmountCell', () => {
  it('parses numbers as major units', () => {
    expect(parseAmountCell(1234.5)).toBe(123450)
  })
  it('strips symbols from strings and returns magnitude', () => {
    expect(parseAmountCell('₱1,234.50')).toBe(123450)
    expect(parseAmountCell('-500')).toBe(50000)
  })
})

describe('parseMatrix', () => {
  const matrix: unknown[][] = [
    ['Date', 'Amount', 'Description', 'Type'],
    ['2026-06-15', '1500', 'Jollibee', 'Debit'],
    ['2026-06-16', '50000', 'Salary', 'Credit'],
    ['bad', 'x', 'skip me', 'Debit'],
  ]
  const mapping: ColumnMapping = {
    date: 0,
    amount: 1,
    description: 2,
    type: 3,
    hasHeader: true,
    amountSign: 'signed',
  }

  it('maps columns, drops the header and skips unparseable rows', () => {
    const rows = parseMatrix(matrix, mapping)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ amount: -150000, type: 'expense', description: 'Jollibee' })
    expect(rows[1]).toMatchObject({ amount: 5000000, type: 'income', description: 'Salary' })
  })

  it('honors amountSign when no type column is present', () => {
    const rows = parseMatrix(
      [
        ['2026-06-15', '1500', 'Coffee'],
        ['2026-06-16', '200', 'Snack'],
      ],
      { date: 0, amount: 1, description: 2, hasHeader: false, amountSign: 'expense' },
    )
    expect(rows.every((r) => r.type === 'expense' && r.amount < 0)).toBe(true)
  })
})

describe('dedupeRows', () => {
  it('separates fresh from already-imported and dedups within the file', () => {
    const rows = parseMatrix(
      [
        ['2026-06-15', '1500', 'Jollibee'],
        ['2026-06-15', '1500', 'Jollibee'], // dup within file
        ['2026-06-16', '200', 'Snack'],
      ],
      { date: 0, amount: 1, description: 2, hasHeader: false, amountSign: 'expense' },
    )
    const existing = new Set([importHash('gcash', rows[2].date, rows[2].amount, rows[2].description)])
    const { fresh, duplicates } = dedupeRows(rows, 'gcash', existing)
    expect(fresh).toHaveLength(1) // only the first Jollibee
    expect(duplicates).toHaveLength(2) // the in-file dup + the pre-existing Snack
  })
})
