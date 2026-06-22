// Pure derived-money engine. Operates on plain arrays only — NO Dexie import.
// All correctness lives here and is unit-tested (see balances.test.ts).

import type { Account, Transaction, Budget, Goal } from '../db/types'

/** "YYYY-MM" key for an epoch-ms timestamp, in local time. */
export function monthKey(date: number): string {
  const d = new Date(date)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${month}`
}

/**
 * openingBalance + Σ amounts of txns belonging to this account. `goal` earmarks
 * are virtual (they tag existing money toward a goal, they don't move it) so
 * they never affect a real balance — and through this, never net worth either.
 */
export function accountBalance(
  account: Pick<Account, 'id' | 'openingBalance'>,
  txns: Transaction[],
): number {
  let sum = account.openingBalance
  for (const t of txns) {
    if (t.accountId !== account.id) continue
    if (t.type === 'goal') continue
    sum += t.amount
  }
  return sum
}

/** Σ of every account balance. Negative balances (e.g. credit) lower it. */
export function netWorth(accounts: Account[], txns: Transaction[]): number {
  let sum = 0
  for (const a of accounts) sum += accountBalance(a, txns)
  return sum
}

export interface AssetsLiabilities {
  assets: number // Σ of positive balances
  liabilities: number // Σ of negative balances (a negative number)
  net: number // assets + liabilities === netWorth
}

/** Split net worth into positive (assets) and negative (liabilities) sides. */
export function assetsLiabilities(
  accounts: Account[],
  txns: Transaction[],
): AssetsLiabilities {
  let assets = 0
  let liabilities = 0
  for (const a of accounts) {
    const bal = accountBalance(a, txns)
    if (bal >= 0) assets += bal
    else liabilities += bal
  }
  return { assets, liabilities, net: assets + liabilities }
}

/**
 * Σ |amount| of expense txns in this budget's category for the given month
 * ("YYYY-MM"). Income, transfers and adjustments are excluded by the type
 * filter, so they never count against a budget.
 */
export function budgetSpent(
  budget: Pick<Budget, 'categoryId'>,
  txns: Transaction[],
  month: string,
): number {
  let spent = 0
  for (const t of txns) {
    if (
      t.type === 'expense' &&
      t.categoryId === budget.categoryId &&
      monthKey(t.date) === month
    ) {
      spent += Math.abs(t.amount)
    }
  }
  return spent
}

/**
 * Σ |amount| of ALL expense txns in the given month ("YYYY-MM") — the headline
 * monthly-budget total. Uncategorized expenses count too; income, transfers,
 * adjustments and goal earmarks are excluded by the type filter.
 */
export function overallSpent(txns: Transaction[], month: string): number {
  let spent = 0
  for (const t of txns) {
    if (t.type === 'expense' && monthKey(t.date) === month) {
      spent += Math.abs(t.amount)
    }
  }
  return spent
}

/**
 * Saved-so-far for a goal. If the goal is linked to an account, that account's
 * balance is the progress; otherwise Σ amounts of txns tagged with goalId.
 */
export function goalProgress(
  goal: Goal,
  txns: Transaction[],
  accounts?: Account[],
): number {
  if (goal.linkedAccountId && accounts) {
    const linked = accounts.find((a) => a.id === goal.linkedAccountId)
    if (linked) return accountBalance(linked, txns)
  }
  let sum = 0
  for (const t of txns) {
    if (t.goalId === goal.id) sum += t.amount
  }
  return sum
}
