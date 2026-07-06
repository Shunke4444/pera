import { useEffect, useState } from 'react'
import { subscribeChange } from '../db/changes'
import {
  listGoals,
  listRecurring,
  getAccounts,
  getAccount,
  getTransactions,
  getTransactionsByAccount,
  getCategories,
  getBudgets,
  getSettings,
  getRecurring,
} from '../db/repo'
import type {
  Account,
  Transaction,
  Category,
  Budget,
  Goal,
  Settings,
  RecurringRule,
} from '../db/types'
import {
  netWorth,
  assetsLiabilities,
  type AssetsLiabilities,
} from '../lib/balances'

export { useHiddenBalances, setHiddenBalances } from './useHiddenBalances'

/**
 * Reactive query hook — the SQLite replacement for Dexie's `useLiveQuery`. Runs
 * `q` on mount + whenever `deps` change, and re-runs on every "data changed"
 * signal (fired by repo mutations). `initial` is returned until the first result
 * lands; a rejected query (e.g. DB not yet initialized) is swallowed — the
 * post-init change signal re-runs it.
 */
function useQuery<T>(q: () => Promise<T>, initial: T, deps: unknown[]): T {
  const [value, setValue] = useState<T>(initial)
  useEffect(() => {
    let alive = true
    const load = () => {
      q()
        .then((v) => {
          if (alive) setValue(v)
        })
        .catch(() => {
          /* DB not ready yet — a later emitChange() will re-run this */
        })
    }
    load()
    const unsub = subscribeChange(load)
    return () => {
      alive = false
      unsub()
    }
  }, deps)
  return value
}

/** Non-archived accounts, in sort order. */
export function useAccounts(): Account[] {
  return useQuery(async () => (await getAccounts()).filter((a) => !a.archived), [], [])
}

/** Every account incl. archived, in sort order (for Settings / manage). */
export function useAllAccounts(): Account[] {
  return useQuery(() => getAccounts(), [], [])
}

/** Archived accounts only. */
export function useArchivedAccounts(): Account[] {
  return useQuery(async () => (await getAccounts()).filter((a) => a.archived), [], [])
}

/**
 * A single account by id. Distinguishes the two empty states so screens don't
 * flash "not found" on a cold deep-link:
 *   `undefined` → still loading (query hasn't emitted yet)
 *   `null`      → loaded, but no such account
 */
export function useAccount(id: string | undefined): Account | null | undefined {
  return useQuery<Account | null | undefined>(
    async () => (id ? ((await getAccount(id)) ?? null) : null),
    undefined,
    [id],
  )
}

/** All transactions, newest first. Pass an accountId to scope to one account. */
export function useTransactions(accountId?: string): Transaction[] {
  return useQuery(
    async () => {
      const rows = accountId ? await getTransactionsByAccount(accountId) : await getTransactions()
      return rows.sort((a, b) => b.date - a.date)
    },
    [],
    [accountId],
  )
}

export function useCategories(): Category[] {
  return useQuery(() => getCategories(), [], [])
}

export function useBudgets(): Budget[] {
  return useQuery(() => getBudgets(), [], [])
}

export function useGoals(): Goal[] {
  return useQuery(() => listGoals(), [], [])
}

/** Non-archived recurring rules, soonest next run first. */
export function useRecurring(): RecurringRule[] {
  return useQuery(() => listRecurring(), [], [])
}

/** Every recurring rule incl. paused (archived), soonest next run first. */
export function useAllRecurring(): RecurringRule[] {
  return useQuery(
    async () => (await getRecurring()).sort((a, b) => a.nextRunDate - b.nextRunDate),
    [],
    [],
  )
}

export function useSettings(): Settings | undefined {
  return useQuery<Settings | undefined>(() => getSettings(), undefined, [])
}

/** Live net worth across visible (non-archived) accounts. */
export function useNetWorth(): number {
  return useQuery(
    async () => {
      const [accounts, txns] = await Promise.all([getAccounts(), getTransactions()])
      return netWorth(
        accounts.filter((a) => !a.archived),
        txns,
      )
    },
    0,
    [],
  )
}

/** Live assets / liabilities split over visible (non-archived) accounts. */
export function useAssetsLiabilities(): AssetsLiabilities {
  return useQuery(
    async () => {
      const [accounts, txns] = await Promise.all([getAccounts(), getTransactions()])
      return assetsLiabilities(
        accounts.filter((a) => !a.archived),
        txns,
      )
    },
    { assets: 0, liabilities: 0, net: 0 },
    [],
  )
}
