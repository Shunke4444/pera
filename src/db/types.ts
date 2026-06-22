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
}
