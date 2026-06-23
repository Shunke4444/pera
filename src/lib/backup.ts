// Pure backup (de)serialization. The DB read/write wrappers live in db/repo;
// this module just shapes and validates the payload + builds a CSV.

import type {
  Account,
  Budget,
  Category,
  Goal,
  Settings,
  Transaction,
  RecurringRule,
} from '../db/types'
import { fromMinor } from './money'
import { toDateInput } from './dates'

export interface BackupV1 {
  app: 'pera'
  version: 1
  exportedAt: number
  accounts: Account[]
  transactions: Transaction[]
  categories: Category[]
  budgets: Budget[]
  goals: Goal[]
  settings: Settings[]
  // Added with recurring transactions; optional so pre-recurring backups (which
  // omit the key) still validate and restore.
  recurring?: RecurringRule[]
}

export interface BackupTables {
  accounts: Account[]
  transactions: Transaction[]
  categories: Category[]
  budgets: Budget[]
  goals: Goal[]
  settings: Settings[]
  recurring?: RecurringRule[]
}

export function buildBackup(tables: BackupTables, exportedAt: number): BackupV1 {
  return { app: 'pera', version: 1, exportedAt, ...tables }
}

/** A row is restorable only if it's an object carrying a non-empty string id. */
function isRow(r: unknown): boolean {
  if (!r || typeof r !== 'object') return false
  const id = (r as { id?: unknown }).id
  return typeof id === 'string' && id !== ''
}

/**
 * Structural + row-level validation so a bad/foreign file can't corrupt the DB
 * on import. Checking every row has a usable id BEFORE we touch the DB means a
 * malformed-but-plausible backup is rejected up front rather than failing
 * mid-restore (where it could leave the DB half-written).
 */
export function isValidBackup(obj: unknown): obj is BackupV1 {
  if (!obj || typeof obj !== 'object') return false
  const b = obj as Record<string, unknown>
  if (b.app !== 'pera' || b.version !== 1) return false
  const arrays = ['accounts', 'transactions', 'categories', 'budgets', 'goals', 'settings']
  const requiredOk = arrays.every((k) => Array.isArray(b[k]) && (b[k] as unknown[]).every(isRow))
  // `recurring` is optional (older backups omit it); if present it must be valid.
  const recurringOk =
    b.recurring === undefined ||
    (Array.isArray(b.recurring) && (b.recurring as unknown[]).every(isRow))
  return requiredOk && recurringOk
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Transactions → CSV (date, account, type, category, amount in pesos, note). */
export function transactionsToCSV(
  txns: Transaction[],
  accounts: Account[],
  categories: Category[],
): string {
  const acct = (id: string) => accounts.find((a) => a.id === id)?.name ?? id
  const cat = (id?: string) => categories.find((c) => c.id === id)?.name ?? ''
  const header = ['date', 'account', 'type', 'category', 'amount', 'note']
  const lines = [header.join(',')]
  for (const t of [...txns].sort((a, b) => a.date - b.date)) {
    lines.push(
      [
        toDateInput(t.date),
        csvCell(acct(t.accountId)),
        t.type,
        csvCell(cat(t.categoryId)),
        fromMinor(t.amount).toFixed(2),
        csvCell(t.note ?? ''),
      ].join(','),
    )
  }
  return lines.join('\n')
}

const DAY = 24 * 60 * 60 * 1000

/** Days since last backup, or null if never backed up. */
export function daysSinceBackup(lastBackupAt: number | undefined, nowMs: number): number | null {
  if (!lastBackupAt) return null
  return Math.floor((nowMs - lastBackupAt) / DAY)
}

/** Remind to back up if never done, or older than `thresholdDays`. */
export function shouldRemindBackup(
  lastBackupAt: number | undefined,
  nowMs: number,
  thresholdDays = 14,
): boolean {
  const d = daysSinceBackup(lastBackupAt, nowMs)
  return d === null || d >= thresholdDays
}
