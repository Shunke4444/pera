// Domain object ⇄ SQLite row mapping. One encoder map per table drives both full
// inserts and partial updates (so a patch encodes booleans/JSON/undefined the
// same way an insert does); explicit `*FromRow` decoders rebuild typed objects,
// omitting optional fields whose column is NULL to mirror the Dexie shape.

import type {
  Account,
  AccountType,
  Budget,
  Category,
  CategoryKind,
  Goal,
  QuickAddPreset,
  RecurringRule,
  Settings,
  Transaction,
  TransactionType,
} from './types'
import type { SqlValue } from './driver/types'

export type Table =
  | 'accounts'
  | 'transactions'
  | 'categories'
  | 'budgets'
  | 'goals'
  | 'settings'
  | 'recurring'

type Enc = (v: unknown) => SqlValue

const T: Enc = (v) => (v == null ? null : String(v)) // text
const I: Enc = (v) => (v == null ? null : Math.trunc(Number(v))) // integer
const B: Enc = (v) => (v == null ? null : v ? 1 : 0) // boolean → 0/1
const J: Enc = (v) => (v == null ? null : JSON.stringify(v)) // JSON blob

// Column order here IS the insert order. Keys are the exact domain field names.
const ENCODERS: Record<Table, Record<string, Enc>> = {
  accounts: {
    id: T, name: T, bank: T, type: T, currency: T, openingBalance: I,
    isIncomeSource: B, color: T, icon: T, archived: B, sortOrder: I,
    createdAt: I, updatedAt: I,
  },
  transactions: {
    id: T, accountId: T, amount: I, type: T, categoryId: T, transferAccountId: T,
    transferGroupId: T, goalId: T, date: I, note: T, importBatchId: T,
    importHash: T, recurringId: T, pendingId: T, createdAt: I, updatedAt: I,
  },
  categories: { id: T, name: T, kind: T, color: T, icon: T },
  budgets: {
    id: T, categoryId: T, amount: I, period: T, rollover: B, createdAt: I, updatedAt: I,
  },
  goals: {
    id: T, name: T, targetAmount: I, targetDate: I, linkedAccountId: T, color: T,
    icon: T, archived: B, createdAt: I, updatedAt: I,
  },
  settings: {
    id: T, baseCurrency: T, theme: T, lastBackupAt: I, monthlyBudget: I,
    defaultAccountId: T, quickAddPresets: J,
  },
  recurring: {
    id: T, accountId: T, type: T, amount: I, categoryId: T, note: T, freq: T,
    interval: I, anchorDay: I, startDate: I, endDate: I, nextRunDate: I,
    autoPost: B, lastPostedDate: I, archived: B, createdAt: I, updatedAt: I,
  },
}

const COLUMNS: Record<Table, string[]> = Object.fromEntries(
  (Object.keys(ENCODERS) as Table[]).map((t) => [t, Object.keys(ENCODERS[t])]),
) as Record<Table, string[]>

/** Build an INSERT for one row: `[sql, values]`. */
export function insertStmt(table: Table, obj: Record<string, unknown>): [string, SqlValue[]] {
  const cols = COLUMNS[table]
  const enc = ENCODERS[table]
  const values = cols.map((c) => enc[c](obj[c]))
  const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
  return [sql, values]
}

/**
 * Build a partial UPDATE from a patch: `[sql, values]`, or null when the patch
 * touches no known column. Keys absent from the encoder map (or `id`) are
 * ignored; a key present with value `undefined` clears the column to NULL.
 */
export function updateStmt(
  table: Table,
  id: string,
  patch: Record<string, unknown>,
): [string, SqlValue[]] | null {
  const enc = ENCODERS[table]
  const keys = Object.keys(patch).filter((k) => k !== 'id' && k in enc)
  if (keys.length === 0) return null
  const values: SqlValue[] = keys.map((k) => enc[k](patch[k]))
  values.push(id)
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`
  return [sql, values]
}

// ---- decoders (row → typed domain object) --------------------------------- //

type Row = Record<string, unknown>

const num = (v: unknown): number => Number(v)
const str = (v: unknown): string => String(v)
const bool = (v: unknown): boolean => v === 1 || v === true
const optBool = (v: unknown): boolean | undefined => (v == null ? undefined : v === 1 || v === true)

export function accountFromRow(r: Row): Account {
  const a: Account = {
    id: str(r.id),
    name: str(r.name),
    bank: str(r.bank),
    type: str(r.type) as AccountType,
    currency: str(r.currency),
    openingBalance: num(r.openingBalance),
    archived: bool(r.archived),
    sortOrder: num(r.sortOrder),
    createdAt: num(r.createdAt),
    updatedAt: num(r.updatedAt),
  }
  if (r.isIncomeSource != null) a.isIncomeSource = bool(r.isIncomeSource)
  if (r.color != null) a.color = str(r.color)
  if (r.icon != null) a.icon = str(r.icon)
  return a
}

export function transactionFromRow(r: Row): Transaction {
  const t: Transaction = {
    id: str(r.id),
    accountId: str(r.accountId),
    amount: num(r.amount),
    type: str(r.type) as TransactionType,
    date: num(r.date),
    createdAt: num(r.createdAt),
    updatedAt: num(r.updatedAt),
  }
  if (r.categoryId != null) t.categoryId = str(r.categoryId)
  if (r.transferAccountId != null) t.transferAccountId = str(r.transferAccountId)
  if (r.transferGroupId != null) t.transferGroupId = str(r.transferGroupId)
  if (r.goalId != null) t.goalId = str(r.goalId)
  if (r.note != null) t.note = str(r.note)
  if (r.importBatchId != null) t.importBatchId = str(r.importBatchId)
  if (r.importHash != null) t.importHash = str(r.importHash)
  if (r.recurringId != null) t.recurringId = str(r.recurringId)
  if (r.pendingId != null) t.pendingId = str(r.pendingId)
  return t
}

export function categoryFromRow(r: Row): Category {
  const c: Category = {
    id: str(r.id),
    name: str(r.name),
    kind: str(r.kind) as CategoryKind,
    color: str(r.color),
  }
  if (r.icon != null) c.icon = str(r.icon)
  return c
}

export function budgetFromRow(r: Row): Budget {
  const b: Budget = {
    id: str(r.id),
    categoryId: str(r.categoryId),
    amount: num(r.amount),
    period: 'monthly',
    createdAt: num(r.createdAt),
    updatedAt: num(r.updatedAt),
  }
  const rollover = optBool(r.rollover)
  if (rollover !== undefined) b.rollover = rollover
  return b
}

export function goalFromRow(r: Row): Goal {
  const g: Goal = {
    id: str(r.id),
    name: str(r.name),
    targetAmount: num(r.targetAmount),
    archived: bool(r.archived),
    createdAt: num(r.createdAt),
    updatedAt: num(r.updatedAt),
  }
  if (r.targetDate != null) g.targetDate = num(r.targetDate)
  if (r.linkedAccountId != null) g.linkedAccountId = str(r.linkedAccountId)
  if (r.color != null) g.color = str(r.color)
  if (r.icon != null) g.icon = str(r.icon)
  return g
}

export function settingsFromRow(r: Row): Settings {
  const s: Settings = {
    id: 'singleton',
    baseCurrency: str(r.baseCurrency),
    theme: str(r.theme) as Settings['theme'],
  }
  if (r.lastBackupAt != null) s.lastBackupAt = num(r.lastBackupAt)
  if (r.monthlyBudget != null) s.monthlyBudget = num(r.monthlyBudget)
  if (r.defaultAccountId != null) s.defaultAccountId = str(r.defaultAccountId)
  if (r.quickAddPresets != null) {
    s.quickAddPresets = JSON.parse(str(r.quickAddPresets)) as QuickAddPreset[]
  }
  return s
}

export function recurringFromRow(r: Row): RecurringRule {
  const rule: RecurringRule = {
    id: str(r.id),
    accountId: str(r.accountId),
    type: str(r.type) as RecurringRule['type'],
    amount: num(r.amount),
    freq: str(r.freq) as RecurringRule['freq'],
    interval: num(r.interval),
    startDate: num(r.startDate),
    nextRunDate: num(r.nextRunDate),
    autoPost: bool(r.autoPost),
    archived: bool(r.archived),
    createdAt: num(r.createdAt),
    updatedAt: num(r.updatedAt),
  }
  if (r.categoryId != null) rule.categoryId = str(r.categoryId)
  if (r.note != null) rule.note = str(r.note)
  if (r.anchorDay != null) rule.anchorDay = num(r.anchorDay)
  if (r.endDate != null) rule.endDate = num(r.endDate)
  if (r.lastPostedDate != null) rule.lastPostedDate = num(r.lastPostedDate)
  return rule
}
