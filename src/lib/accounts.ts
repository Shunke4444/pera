// Pure account-type helpers shared by the dashboard filter and tiles.
import type { Account, AccountType } from '../db/types'

/** Canonical display order for account types. */
export const TYPE_ORDER: AccountType[] = [
  'ewallet',
  'savings',
  'checking',
  'credit',
  'cash',
  'investment',
]

export const TYPE_LABEL: Record<AccountType, string> = {
  ewallet: 'E-wallet',
  savings: 'Savings',
  checking: 'Checking',
  credit: 'Credit',
  cash: 'Cash',
  investment: 'Investment',
}

/** The account types present among non-archived accounts, in canonical order. */
export function presentTypes(accounts: Account[]): AccountType[] {
  const have = new Set(accounts.filter((a) => !a.archived).map((a) => a.type))
  return TYPE_ORDER.filter((t) => have.has(t))
}

/** Dashboard filter value: a concrete type, or "all". */
export type AccountFilter = AccountType | 'all'

/** Scope an account list by filter; "all" returns the list unchanged. */
export function filterAccountsByType(accounts: Account[], filter: AccountFilter): Account[] {
  return filter === 'all' ? accounts : accounts.filter((a) => a.type === filter)
}
