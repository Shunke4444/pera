import { describe, it, expect } from 'vitest'
import {
  spendingByCategory,
  budgetBreakdown,
  incomeExpenseByMonth,
  netWorthAt,
  netWorthSeries,
} from './insights'
import type { Account, Category, Transaction } from '../db/types'

const cats: Category[] = [
  { id: 'food', name: 'Food', kind: 'expense', color: '#a' },
  { id: 'bills', name: 'Bills', kind: 'expense', color: '#b' },
]

let seq = 0
function tx(p: Partial<Transaction>): Transaction {
  return {
    id: `t${seq++}`,
    accountId: 'gcash',
    amount: -100,
    type: 'expense',
    date: new Date(2026, 5, 10).getTime(), // June 2026
    createdAt: 0,
    updatedAt: 0,
    ...p,
  }
}

function acct(id: string, opening: number): Account {
  return {
    id,
    name: id,
    bank: id,
    type: 'savings',
    currency: 'PHP',
    openingBalance: opening,
    archived: false,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('spendingByCategory', () => {
  const txns = [
    tx({ categoryId: 'food', amount: -1500 }),
    tx({ categoryId: 'food', amount: -2500 }),
    tx({ categoryId: 'bills', amount: -1000 }),
    tx({ categoryId: 'food', amount: 9999, type: 'income' }), // income excluded
    tx({ amount: -3000, type: 'transfer' }), // transfer excluded
    tx({ categoryId: 'food', amount: -1234, type: 'adjustment' }), // adjustment excluded
    tx({ categoryId: 'food', amount: 4444, type: 'goal', goalId: 'g1' }), // goal earmark excluded
    tx({ categoryId: 'food', amount: -7777, date: new Date(2026, 4, 1).getTime() }), // May excluded
    tx({ amount: -500 }), // uncategorized expense
  ]

  it('sums expenses per category for the month, biggest first', () => {
    const slices = spendingByCategory(txns, cats, '2026-06')
    expect(slices[0]).toMatchObject({ categoryId: 'food', total: 4000 })
    expect(slices.find((s) => s.categoryId === 'bills')?.total).toBe(1000)
  })

  it('buckets uncategorized expenses under one labeled slice', () => {
    const slices = spendingByCategory(txns, cats, '2026-06')
    const uncat = slices.find((s) => s.categoryId === '__uncat__')
    expect(uncat?.name).toBe('Uncategorized')
    expect(uncat?.total).toBe(500)
  })
})

describe('budgetBreakdown', () => {
  const breakdownCats: Category[] = [
    { id: 'food', name: 'Food', kind: 'expense', color: '#a' },
    { id: 'bills', name: 'Bills', kind: 'expense', color: '#b' },
    { id: 'rent', name: 'Rent', kind: 'expense', color: '#c' },
  ]
  const txns = [
    tx({ categoryId: 'food', amount: -4000 }), // capped + spent
    tx({ categoryId: 'bills', amount: -1000 }), // uncapped + spent
    // rent: capped, NO spend this month
    // fun: neither cap nor spend
  ]
  const budgets = [{ categoryId: 'food' }, { categoryId: 'rent' }]

  it('includes capped-and-unspent categories (₱0), keeps uncapped-with-spend, drops neither', () => {
    const rows = budgetBreakdown(txns, breakdownCats, budgets, '2026-06')
    const byId = Object.fromEntries(rows.map((r) => [r.categoryId, r.total]))
    expect(byId).toEqual({ food: 4000, bills: 1000, rent: 0 })
    expect(rows.some((r) => r.categoryId === 'fun')).toBe(false)
  })

  it('sorts biggest-spend-first, with unspent caps last', () => {
    const rows = budgetBreakdown(txns, breakdownCats, budgets, '2026-06')
    expect(rows.map((r) => r.categoryId)).toEqual(['food', 'bills', 'rent'])
  })
})

describe('incomeExpenseByMonth', () => {
  it('totals income and expense per month, excluding transfers, adjustments and goal earmarks', () => {
    const txns = [
      tx({ type: 'income', amount: 50000 }),
      tx({ type: 'expense', amount: -1500 }),
      tx({ type: 'transfer', amount: -9999 }),
      tx({ type: 'adjustment', amount: 1234 }),
      tx({ type: 'goal', amount: 8000, goalId: 'g1' }), // earmark, never income
    ]
    const [june] = incomeExpenseByMonth(txns, ['2026-06'])
    expect(june.income).toBe(50000)
    expect(june.expense).toBe(1500)
    expect(june.net).toBe(48500)
  })
})

describe('netWorthAt / netWorthSeries', () => {
  const accounts = [acct('gcash', 10000), acct('maya', 0)]
  const txns = [
    tx({ accountId: 'gcash', amount: -2000, date: new Date(2026, 4, 15).getTime() }), // May
    tx({ accountId: 'maya', amount: 5000, type: 'income', date: new Date(2026, 5, 15).getTime() }), // June
  ]

  it('counts only txns dated on/before the cutoff', () => {
    // End of May: only the -2000 applies → 10000 - 2000 = 8000
    expect(netWorthAt(accounts, txns, new Date(2026, 4, 31, 23, 59).getTime())).toBe(8000)
  })

  it('builds a cumulative series across months', () => {
    const series = netWorthSeries(accounts, txns, ['2026-05', '2026-06'])
    expect(series[0].value).toBe(8000)
    expect(series[1].value).toBe(13000) // + 5000 income in June
  })
})
