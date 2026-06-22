import { describe, it, expect } from 'vitest'
import {
  buildBackup,
  isValidBackup,
  transactionsToCSV,
  daysSinceBackup,
  shouldRemindBackup,
  type BackupTables,
} from './backup'
import type { Account, Transaction, Category } from '../db/types'

const empty: BackupTables = {
  accounts: [],
  transactions: [],
  categories: [],
  budgets: [],
  goals: [],
  settings: [],
}

describe('buildBackup / isValidBackup', () => {
  it('round-trips a freshly built backup as valid', () => {
    const b = buildBackup(empty, 123)
    expect(b.app).toBe('pera')
    expect(b.version).toBe(1)
    expect(b.exportedAt).toBe(123)
    expect(isValidBackup(b)).toBe(true)
  })

  it('rejects foreign or malformed objects', () => {
    expect(isValidBackup(null)).toBe(false)
    expect(isValidBackup({ app: 'other', version: 1 })).toBe(false)
    expect(isValidBackup({ app: 'pera', version: 2, accounts: [] })).toBe(false)
    expect(isValidBackup({ app: 'pera', version: 1, accounts: 'nope' })).toBe(false)
  })

  it('validates after a JSON string round-trip', () => {
    const b = buildBackup(empty, 1)
    expect(isValidBackup(JSON.parse(JSON.stringify(b)))).toBe(true)
  })

  it('rejects a backup whose rows are missing or have an empty id', () => {
    const base = buildBackup(empty, 1)
    expect(isValidBackup({ ...base, accounts: [{ name: 'GCash' }] })).toBe(false)
    expect(isValidBackup({ ...base, transactions: [{ amount: 100 }] })).toBe(false)
    expect(isValidBackup({ ...base, goals: [{ id: '' }] })).toBe(false)
    expect(isValidBackup({ ...base, categories: [null] })).toBe(false)
  })

  it('accepts a backup whose every row carries a non-empty id', () => {
    const b = buildBackup(
      { ...empty, accounts: [{ id: 'a1', name: 'GCash' } as Account] },
      1,
    )
    expect(isValidBackup(b)).toBe(true)
  })
})

describe('transactionsToCSV', () => {
  const accounts: Account[] = [
    { id: 'gcash', name: 'GCash', bank: 'GCash', type: 'ewallet', currency: 'PHP', openingBalance: 0, archived: false, sortOrder: 0, createdAt: 0, updatedAt: 0 },
  ]
  const cats: Category[] = [{ id: 'food', name: 'Food', kind: 'expense', color: '#000' }]
  const txns: Transaction[] = [
    { id: 't1', accountId: 'gcash', amount: -150000, type: 'expense', categoryId: 'food', date: new Date(2026, 5, 15).getTime(), note: 'Jollibee, SM', createdAt: 0, updatedAt: 0 },
  ]

  it('emits a header and a row with pesos and quoted commas', () => {
    const csv = transactionsToCSV(txns, accounts, cats)
    const [header, row] = csv.split('\n')
    expect(header).toBe('date,account,type,category,amount,note')
    expect(row).toContain('2026-06-15')
    expect(row).toContain('GCash')
    expect(row).toContain('-1500.00')
    expect(row).toContain('"Jollibee, SM"')
  })
})

describe('backup reminder', () => {
  const now = new Date(2026, 5, 20).getTime()
  it('daysSinceBackup is null when never backed up', () => {
    expect(daysSinceBackup(undefined, now)).toBeNull()
  })
  it('counts whole days since the last backup', () => {
    expect(daysSinceBackup(new Date(2026, 5, 10).getTime(), now)).toBe(10)
  })
  it('reminds when never backed up or older than threshold', () => {
    expect(shouldRemindBackup(undefined, now)).toBe(true)
    expect(shouldRemindBackup(new Date(2026, 5, 1).getTime(), now, 14)).toBe(true) // 19 days
    expect(shouldRemindBackup(new Date(2026, 5, 18).getTime(), now, 14)).toBe(false) // 2 days
  })
})
