// Pure aggregations behind the Insights charts. Each returns plain numbers in
// minor units so a chart and a hand check read the same value.

import type { Account, Category, Transaction } from '../db/types'
import { accountBalance, monthKey } from './balances'
import { monthEndMs } from './dates'

export interface CategorySlice {
  categoryId: string
  name: string
  color: string
  total: number // minor units, positive
}

/**
 * Expense spend grouped by category for one month, biggest first. Income,
 * transfers and adjustments are excluded; uncategorized lands under one slice.
 */
export function spendingByCategory(
  txns: Transaction[],
  categories: Category[],
  month: string,
): CategorySlice[] {
  const totals = new Map<string, number>()
  for (const t of txns) {
    if (t.type !== 'expense') continue
    if (monthKey(t.date) !== month) continue
    const key = t.categoryId ?? '__uncat__'
    totals.set(key, (totals.get(key) ?? 0) + Math.abs(t.amount))
  }
  const slices: CategorySlice[] = []
  for (const [key, total] of totals) {
    const cat = categories.find((c) => c.id === key)
    slices.push({
      categoryId: key,
      name: cat?.name ?? 'Uncategorized',
      color: cat?.color ?? '#9AA0AA',
      total,
    })
  }
  return slices.sort((a, b) => b.total - a.total)
}

export interface MonthFlow {
  month: string
  income: number // minor units, positive
  expense: number // minor units, positive
  net: number // income - expense
}

/** Income vs expense totals per month (transfers/adjustments excluded). */
export function incomeExpenseByMonth(txns: Transaction[], months: string[]): MonthFlow[] {
  return months.map((m) => {
    let income = 0
    let expense = 0
    for (const t of txns) {
      if (monthKey(t.date) !== m) continue
      if (t.type === 'income') income += t.amount
      else if (t.type === 'expense') expense += Math.abs(t.amount)
    }
    return { month: m, income, expense, net: income - expense }
  })
}

/** Net worth as of the last instant of `endMs` (txns dated after are ignored). */
export function netWorthAt(accounts: Account[], txns: Transaction[], endMs: number): number {
  const upto = txns.filter((t) => t.date <= endMs)
  let sum = 0
  for (const a of accounts) sum += accountBalance(a, upto)
  return sum
}

export interface NetWorthPoint {
  month: string
  value: number
}

/** Net worth at the end of each given month (cumulative). */
export function netWorthSeries(
  accounts: Account[],
  txns: Transaction[],
  months: string[],
): NetWorthPoint[] {
  return months.map((m) => ({ month: m, value: netWorthAt(accounts, txns, monthEndMs(m)) }))
}
