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

/**
 * Home-hub selector value: an account filter ("all" / a type) plus the two
 * non-account views the chip row also switches between.
 */
export type HomeView = AccountFilter | 'goals' | 'budget'

/**
 * The chip values shown on the home hub, in order:
 * All · <present account types> · Goals · Budget.
 * Goals and Budget are always offered (their views stand alone); account-type
 * chips only appear for types that exist.
 */
export function homeViews(accounts: Account[]): HomeView[] {
  return ['all', ...presentTypes(accounts), 'goals', 'budget']
}

export const VIEW_LABEL: Record<HomeView, string> = {
  ...TYPE_LABEL,
  all: 'All',
  goals: 'Goals',
  budget: 'Budget',
}

/** Is this home view an account list (vs the Goals / Budget views)? */
export function isAccountView(view: HomeView): view is AccountFilter {
  return view !== 'goals' && view !== 'budget'
}

/**
 * Resolve a persisted view against the chips currently available, falling back
 * to "all" when the stored value is gone (e.g. the last account of a type was
 * archived, so that type chip no longer exists).
 */
export function resolveHomeView(stored: string | null, accounts: Account[]): HomeView {
  const views = homeViews(accounts)
  return views.includes(stored as HomeView) ? (stored as HomeView) : 'all'
}
