import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Account, Transaction, Category, Budget, Goal, Settings } from '../db/types'
import {
  netWorth,
  assetsLiabilities,
  type AssetsLiabilities,
} from '../lib/balances'

/** Non-archived accounts, in sort order. */
export function useAccounts(): Account[] {
  return (
    useLiveQuery(async () => {
      const rows = await db.accounts.orderBy('sortOrder').toArray()
      return rows.filter((a) => !a.archived)
    }, []) ?? []
  )
}

/** Every account incl. archived, in sort order (for Settings / manage). */
export function useAllAccounts(): Account[] {
  return useLiveQuery(() => db.accounts.orderBy('sortOrder').toArray(), []) ?? []
}

/** Archived accounts only. */
export function useArchivedAccounts(): Account[] {
  return (
    useLiveQuery(async () => {
      const rows = await db.accounts.orderBy('sortOrder').toArray()
      return rows.filter((a) => a.archived)
    }, []) ?? []
  )
}

/**
 * A single account by id. Distinguishes the two empty states so screens don't
 * flash "not found" on a cold deep-link:
 *   `undefined` → still loading (live query hasn't emitted yet)
 *   `null`      → loaded, but no such account
 */
export function useAccount(id: string | undefined): Account | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.accounts.get(id)) ?? null) : null), [id])
}

/** All transactions, newest first. Pass an accountId to scope to one account. */
export function useTransactions(accountId?: string): Transaction[] {
  return (
    useLiveQuery(async () => {
      const rows = accountId
        ? await db.transactions.where('accountId').equals(accountId).toArray()
        : await db.transactions.toArray()
      return rows.sort((a, b) => b.date - a.date)
    }, [accountId]) ?? []
  )
}

export function useCategories(): Category[] {
  return useLiveQuery(() => db.categories.toArray(), []) ?? []
}

export function useBudgets(): Budget[] {
  return useLiveQuery(() => db.budgets.toArray(), []) ?? []
}

export function useGoals(): Goal[] {
  return (
    useLiveQuery(async () => {
      const rows = await db.goals.toArray()
      return rows.filter((g) => !g.archived).sort((a, b) => a.createdAt - b.createdAt)
    }, []) ?? []
  )
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => db.settings.get('singleton'), [])
}

/** Live net worth across visible (non-archived) accounts. */
export function useNetWorth(): number {
  return (
    useLiveQuery(async () => {
      const [accounts, txns] = await Promise.all([
        db.accounts.toArray(),
        db.transactions.toArray(),
      ])
      return netWorth(
        accounts.filter((a) => !a.archived),
        txns,
      )
    }, []) ?? 0
  )
}

/** Live assets / liabilities split over visible (non-archived) accounts. */
export function useAssetsLiabilities(): AssetsLiabilities {
  return (
    useLiveQuery(async () => {
      const [accounts, txns] = await Promise.all([
        db.accounts.toArray(),
        db.transactions.toArray(),
      ])
      return assetsLiabilities(
        accounts.filter((a) => !a.archived),
        txns,
      )
    }, []) ?? { assets: 0, liabilities: 0, net: 0 }
  )
}
