import { describe, it, expect } from 'vitest'
import { filterTransactions } from './activity'
import type { Category, Transaction } from '../db/types'

const cats: Category[] = [
  { id: 'food', name: 'Food', kind: 'expense', color: '#000' },
  { id: 'salary', name: 'Salary', kind: 'income', color: '#000' },
]

let seq = 0
function tx(p: Partial<Transaction>): Transaction {
  return {
    id: `t${seq++}`,
    accountId: 'gcash',
    amount: -100,
    type: 'expense',
    date: 0,
    createdAt: 0,
    updatedAt: 0,
    ...p,
  }
}

const data: Transaction[] = [
  tx({ accountId: 'gcash', type: 'expense', categoryId: 'food', note: 'Jollibee' }),
  tx({ accountId: 'maya', type: 'income', categoryId: 'salary', amount: 5000 }),
  tx({ accountId: 'gcash', type: 'transfer', amount: -2000 }),
]

describe('filterTransactions', () => {
  it('filters by account', () => {
    expect(filterTransactions(data, { accountId: 'maya' }, cats)).toHaveLength(1)
  })
  it('filters by type', () => {
    expect(filterTransactions(data, { type: 'transfer' }, cats)).toHaveLength(1)
  })
  it('filters by category', () => {
    expect(filterTransactions(data, { categoryId: 'food' }, cats)).toHaveLength(1)
  })
  it('searches the note', () => {
    expect(filterTransactions(data, { search: 'jolli' }, cats)).toHaveLength(1)
  })
  it('searches the category name', () => {
    expect(filterTransactions(data, { search: 'salary' }, cats)).toHaveLength(1)
  })
  it('combines filters (AND)', () => {
    expect(filterTransactions(data, { accountId: 'gcash', type: 'expense' }, cats)).toHaveLength(1)
  })
  it('returns all when filter is empty', () => {
    expect(filterTransactions(data, {}, cats)).toHaveLength(3)
  })
})
