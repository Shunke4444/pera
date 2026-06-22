import { describe, it, expect } from 'vitest'
import type { Account, Transaction, Budget, Goal } from '../db/types'
import {
  accountBalance,
  netWorth,
  assetsLiabilities,
  budgetSpent,
  overallSpent,
  goalProgress,
  monthKey,
} from './balances'

// ---- factories (fill required fields, override what the test cares about) ----
function acct(p: Partial<Account> & { id: string }): Account {
  return {
    name: p.id,
    bank: p.id,
    type: 'savings',
    currency: 'PHP',
    openingBalance: 0,
    archived: false,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    ...p,
  }
}

let txnSeq = 0
function tx(p: Partial<Transaction> & { accountId: string; amount: number }): Transaction {
  return {
    id: `t${txnSeq++}`,
    type: 'expense',
    date: new Date(2026, 5, 15).getTime(), // June 2026
    createdAt: 0,
    updatedAt: 0,
    ...p,
  }
}

describe('accountBalance', () => {
  it('is openingBalance plus the sum of that account txns', () => {
    const a = acct({ id: 'gcash', openingBalance: 10000 })
    const txns = [
      tx({ accountId: 'gcash', amount: -2500, categoryId: 'food' }),
      tx({ accountId: 'gcash', amount: 5000, type: 'income', categoryId: 'salary' }),
      tx({ accountId: 'maya', amount: -9999 }), // other account, ignored
    ]
    expect(accountBalance(a, txns)).toBe(10000 - 2500 + 5000)
  })

  it('equals openingBalance when there are no txns', () => {
    expect(accountBalance(acct({ id: 'x', openingBalance: 777 }), [])).toBe(777)
  })

  it('reflects an adjustment txn (real − computed) so balance matches reality', () => {
    const a = acct({ id: 'maribank', openingBalance: 0 })
    const txns = [tx({ accountId: 'maribank', amount: -100, type: 'expense' })]
    // computed = -100; user says real balance is 5000 → adjustment = 5100
    const adjustment = tx({ accountId: 'maribank', amount: 5100, type: 'adjustment' })
    expect(accountBalance(a, [...txns, adjustment])).toBe(5000)
  })

  it('ignores goal-earmark txns (a virtual contribution moves no real money)', () => {
    const a = acct({ id: 'gcash', openingBalance: 10000 })
    const txns = [tx({ accountId: 'gcash', amount: 5000, type: 'goal', goalId: 'g1' })]
    expect(accountBalance(a, txns)).toBe(10000)
  })
})

describe('transfers', () => {
  it('two linked legs net to zero across the pair (no money created)', () => {
    const src = acct({ id: 'gcash', openingBalance: 10000 })
    const dst = acct({ id: 'maya', openingBalance: 0 })
    const legs: Transaction[] = [
      tx({ accountId: 'gcash', amount: -3000, type: 'transfer', transferGroupId: 'g1', transferAccountId: 'maya' }),
      tx({ accountId: 'maya', amount: 3000, type: 'transfer', transferGroupId: 'g1', transferAccountId: 'gcash' }),
    ]
    expect(accountBalance(src, legs)).toBe(7000)
    expect(accountBalance(dst, legs)).toBe(3000)
    expect(netWorth([src, dst], legs)).toBe(10000)
  })
})

describe('netWorth & assetsLiabilities', () => {
  it('sums all account balances', () => {
    const accounts = [
      acct({ id: 'a', openingBalance: 10000 }),
      acct({ id: 'b', openingBalance: 25000 }),
    ]
    expect(netWorth(accounts, [])).toBe(35000)
  })

  it('treats a negative-balance account as a liability that lowers net worth', () => {
    const assets = acct({ id: 'savings', openingBalance: 50000 })
    const card = acct({ id: 'card', type: 'credit', openingBalance: 0 })
    const txns = [tx({ accountId: 'card', amount: -12000, type: 'expense', categoryId: 'shopping' })]

    const split = assetsLiabilities([assets, card], txns)
    expect(split.assets).toBe(50000)
    expect(split.liabilities).toBe(-12000)
    expect(split.net).toBe(38000)
    expect(netWorth([assets, card], txns)).toBe(38000)
  })
})

describe('budgetSpent', () => {
  const budget: Budget = {
    id: 'b1',
    categoryId: 'food',
    amount: 500000,
    period: 'monthly',
    createdAt: 0,
    updatedAt: 0,
  }

  it('sums absolute expense amounts in the category for the given month', () => {
    const txns = [
      tx({ accountId: 'gcash', amount: -1500, type: 'expense', categoryId: 'food' }),
      tx({ accountId: 'gcash', amount: -2500, type: 'expense', categoryId: 'food' }),
    ]
    expect(budgetSpent(budget, txns, '2026-06')).toBe(4000)
  })

  it('excludes other categories, other months, income, transfers and adjustments', () => {
    const txns = [
      tx({ accountId: 'gcash', amount: -1000, type: 'expense', categoryId: 'food' }), // counts
      tx({ accountId: 'gcash', amount: -9999, type: 'expense', categoryId: 'transport' }), // other cat
      tx({ accountId: 'gcash', amount: -8888, type: 'expense', categoryId: 'food', date: new Date(2026, 4, 30).getTime() }), // May
      tx({ accountId: 'gcash', amount: 5000, type: 'income', categoryId: 'food' }), // income, not spend
      tx({ accountId: 'gcash', amount: -3000, type: 'transfer', categoryId: 'food' }), // transfer
      tx({ accountId: 'gcash', amount: -3000, type: 'adjustment', categoryId: 'food' }), // adjustment
    ]
    expect(budgetSpent(budget, txns, '2026-06')).toBe(1000)
  })

  it('is zero when nothing matches', () => {
    expect(budgetSpent(budget, [], '2026-06')).toBe(0)
  })
})

describe('overallSpent', () => {
  it('sums absolute expense amounts across every category in the given month', () => {
    const txns = [
      tx({ accountId: 'gcash', amount: -1500, type: 'expense', categoryId: 'food' }),
      tx({ accountId: 'gcash', amount: -2500, type: 'expense', categoryId: 'transport' }),
      tx({ accountId: 'gcash', amount: -1000, type: 'expense' }), // uncategorized still counts
    ]
    expect(overallSpent(txns, '2026-06')).toBe(5000)
  })

  it('excludes income, transfer, adjustment, goal and other months', () => {
    const txns = [
      tx({ accountId: 'gcash', amount: -1000, type: 'expense', categoryId: 'food' }), // counts
      tx({ accountId: 'gcash', amount: -8888, type: 'expense', date: new Date(2026, 4, 30).getTime() }), // May
      tx({ accountId: 'gcash', amount: 5000, type: 'income' }), // income
      tx({ accountId: 'gcash', amount: -3000, type: 'transfer' }), // transfer
      tx({ accountId: 'gcash', amount: -3000, type: 'adjustment' }), // adjustment
      tx({ accountId: 'gcash', amount: 4000, type: 'goal', goalId: 'g1' }), // goal earmark
    ]
    expect(overallSpent(txns, '2026-06')).toBe(1000)
  })

  it('is zero when nothing matches', () => {
    expect(overallSpent([], '2026-06')).toBe(0)
  })
})

describe('goalProgress', () => {
  const goal: Goal = {
    id: 'goal1',
    name: 'Japan trip',
    targetAmount: 100000,
    archived: false,
    createdAt: 0,
    updatedAt: 0,
  }

  it('sums txns tagged with the goalId', () => {
    const txns = [
      tx({ accountId: 'maribank', amount: 5000, type: 'income', goalId: 'goal1' }),
      tx({ accountId: 'maribank', amount: 3000, type: 'income', goalId: 'goal1' }),
      tx({ accountId: 'maribank', amount: 9999, type: 'income', goalId: 'other' }), // other goal
    ]
    expect(goalProgress(goal, txns)).toBe(8000)
  })

  it('uses the linked account balance when linkedAccountId is set', () => {
    const linked: Goal = { ...goal, linkedAccountId: 'efund' }
    const accounts = [acct({ id: 'efund', openingBalance: 20000 })]
    const txns = [tx({ accountId: 'efund', amount: 4000, type: 'income' })]
    expect(goalProgress(linked, txns, accounts)).toBe(24000)
  })

  it('sums goal-earmark contributions for a virtual goal', () => {
    const txns = [
      tx({ accountId: 'gcash', amount: 5000, type: 'goal', goalId: 'goal1' }),
      tx({ accountId: 'gcash', amount: 3000, type: 'goal', goalId: 'goal1' }),
    ]
    expect(goalProgress(goal, txns)).toBe(8000)
  })

  it('a virtual goal contribution does not change net worth', () => {
    const accounts = [acct({ id: 'gcash', openingBalance: 10000 })]
    const before = netWorth(accounts, [])
    const after = netWorth(accounts, [
      tx({ accountId: 'gcash', amount: 5000, type: 'goal', goalId: 'goal1' }),
    ])
    expect(after).toBe(before)
  })
})

describe('monthKey', () => {
  it('formats an epoch ms as YYYY-MM in local time', () => {
    expect(monthKey(new Date(2026, 5, 15).getTime())).toBe('2026-06')
    expect(monthKey(new Date(2026, 0, 1).getTime())).toBe('2026-01')
    expect(monthKey(new Date(2026, 11, 31).getTime())).toBe('2026-12')
  })
})
