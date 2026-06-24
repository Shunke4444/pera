// Shared domain types. No Dexie import here so `src/lib/*` pure math can use
// these without pulling in the database layer.

export type AccountType =
  | 'ewallet'
  | 'savings'
  | 'checking'
  | 'credit'
  | 'cash'
  | 'investment'

export type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'adjustment'
  | 'goal' // virtual-goal earmark: tracked for goal progress, excluded from all money math

export type CategoryKind = 'income' | 'expense'

export interface Account {
  id: string
  name: string
  bank: string
  type: AccountType
  currency: string
  openingBalance: number // minor units; balance = opening + Σ txns
  isIncomeSource?: boolean
  color?: string
  icon?: string
  archived: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface Transaction {
  id: string
  accountId: string
  amount: number // signed minor units (+income / -expense)
  type: TransactionType
  categoryId?: string
  transferAccountId?: string
  transferGroupId?: string
  goalId?: string
  date: number // epoch ms (day it happened)
  note?: string
  importBatchId?: string
  importHash?: string
  recurringId?: string // the recurring rule that generated this txn (trace + dedupe)
  pendingId?: string // id of the native widget pending-log this txn was drained from (dedupe)
  createdAt: number
  updatedAt: number
}

export type RecurringFreq = 'weekly' | 'monthly' | 'yearly'

export interface RecurringRule {
  id: string
  accountId: string
  type: 'income' | 'expense'
  amount: number // positive minor-unit magnitude; sign derived from `type`
  categoryId?: string
  note?: string
  freq: RecurringFreq
  interval: number // >= 1 (every N freq units)
  anchorDay?: number // day-of-month for monthly/yearly; 0–6 for weekly
  startDate: number // epoch ms
  endDate?: number // epoch ms; rule stops after this day
  nextRunDate: number // epoch ms of the earliest not-yet-posted occurrence
  autoPost: boolean // true = create the txn automatically; false = remind only
  lastPostedDate?: number // epoch ms of the most recent posted occurrence
  archived: boolean
  createdAt: number
  updatedAt: number
}

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  color: string
  icon?: string
}

export interface Budget {
  id: string
  categoryId: string
  amount: number // monthly limit, minor units
  period: 'monthly'
  rollover?: boolean
  createdAt: number
  updatedAt: number
}

export interface Goal {
  id: string
  name: string
  targetAmount: number // minor units
  targetDate?: number
  linkedAccountId?: string
  color?: string
  icon?: string
  archived: boolean
  createdAt: number
  updatedAt: number
}

export interface Settings {
  id: 'singleton'
  baseCurrency: string
  theme: 'system' | 'light' | 'dark'
  lastBackupAt?: number
  monthlyBudget?: number // overall cap on total monthly spend, minor units; undefined = not set
  defaultAccountId?: string // account quick-add posts to by default; undefined = first account
  quickAddPresets?: QuickAddPreset[] // home-screen widget instant-log buttons
}

/**
 * A one-tap "log this" button shown on the native widget. `amount` is a positive
 * minor-unit magnitude; `type` decides the sign. `accountId`/`categoryId` are
 * optional — when an account isn't pinned the snapshot resolves it to the
 * default (or first) account so the native side always has a concrete target.
 */
export interface QuickAddPreset {
  id: string
  label: string
  amount: number // positive minor-unit magnitude
  type: 'expense' | 'income'
  categoryId?: string
  accountId?: string
}
