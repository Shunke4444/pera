// Centralized write layer. Every mutation flows through here so ids, timestamps
// and invariants (transfer pairs, adjustments) live in one place — and so the
// native widget / share-intent can reuse the exact same entry points.
//
// Storage is SQLite now (was Dexie). Function names + return shapes are kept
// identical so callers (screens, hooks, snapshot) don't change; each mutation
// ends with emitChange() to drive the reactive hooks. Reads go through the
// get*() helpers below (used by hooks, the snapshot builder and tests).

import { newId, now } from './db'
import type {
  Account,
  Budget,
  Category,
  CategoryKind,
  Goal,
  QuickAddPreset,
  Transaction,
  RecurringRule,
  RecurringFreq,
  Settings,
} from './types'
import { importHash, type ParsedRow } from '../lib/importing'
import { buildBackup, isValidBackup, type BackupV1 } from '../lib/backup'
import { dueDates, nextDate, nextAfter } from '../lib/recurring'
import { startOfDay } from '../lib/dates'
import { query, run, withTransaction } from './sql'
import { insertRow, updateRow } from './crud'
import { TABLES } from './schema'
import { emitChange } from './changes'
import {
  accountFromRow,
  transactionFromRow,
  categoryFromRow,
  budgetFromRow,
  goalFromRow,
  settingsFromRow,
  recurringFromRow,
} from './rows'

const asRow = (o: unknown): Record<string, unknown> => o as Record<string, unknown>

// --------------------------------------------------------------- reads ------
// Plain array/object reads that mirror the old Dexie `toArray()` / `get()`
// calls. Hooks, the snapshot builder and tests share these.

/** All accounts, in sort order (callers filter archived as needed). */
export async function getAccounts(): Promise<Account[]> {
  return (await query('SELECT * FROM accounts ORDER BY sortOrder')).map(accountFromRow)
}

export async function getAccount(id: string): Promise<Account | undefined> {
  const r = await query('SELECT * FROM accounts WHERE id=?', [id])
  return r[0] ? accountFromRow(r[0]) : undefined
}

/** Every transaction (unordered — pure logic / hooks sort as needed). */
export async function getTransactions(): Promise<Transaction[]> {
  return (await query('SELECT * FROM transactions')).map(transactionFromRow)
}

export async function getTransactionsByAccount(accountId: string): Promise<Transaction[]> {
  return (await query('SELECT * FROM transactions WHERE accountId=?', [accountId])).map(
    transactionFromRow,
  )
}

export async function getTransaction(id: string): Promise<Transaction | undefined> {
  const r = await query('SELECT * FROM transactions WHERE id=?', [id])
  return r[0] ? transactionFromRow(r[0]) : undefined
}

export async function getCategories(): Promise<Category[]> {
  return (await query('SELECT * FROM categories')).map(categoryFromRow)
}

export async function getCategory(id: string): Promise<Category | undefined> {
  const r = await query('SELECT * FROM categories WHERE id=?', [id])
  return r[0] ? categoryFromRow(r[0]) : undefined
}

export async function getBudgets(): Promise<Budget[]> {
  return (await query('SELECT * FROM budgets')).map(budgetFromRow)
}

/** Every goal incl. archived (listGoals filters + sorts for the UI). */
export async function getGoals(): Promise<Goal[]> {
  return (await query('SELECT * FROM goals')).map(goalFromRow)
}

export async function getGoal(id: string): Promise<Goal | undefined> {
  const r = await query('SELECT * FROM goals WHERE id=?', [id])
  return r[0] ? goalFromRow(r[0]) : undefined
}

export async function getSettings(): Promise<Settings | undefined> {
  const r = await query('SELECT * FROM settings WHERE id=?', ['singleton'])
  return r[0] ? settingsFromRow(r[0]) : undefined
}

/** Every recurring rule incl. archived. */
export async function getRecurring(): Promise<RecurringRule[]> {
  return (await query('SELECT * FROM recurring')).map(recurringFromRow)
}

async function getRecurringById(id: string): Promise<RecurringRule | undefined> {
  const r = await query('SELECT * FROM recurring WHERE id=?', [id])
  return r[0] ? recurringFromRow(r[0]) : undefined
}

// ---------------------------------------------------------------- accounts ---

export type NewAccountInput = Pick<Account, 'name' | 'bank' | 'type'> &
  Partial<Pick<Account, 'currency' | 'openingBalance' | 'isIncomeSource' | 'color' | 'icon'>>

/** Insert a new account at the end of the sort order. Returns its id. */
export async function addAccount(input: NewAccountInput): Promise<string> {
  const id = newId()
  const ts = now()
  const maxSort = (await query('SELECT MAX(sortOrder) m FROM accounts'))[0]?.m
  const account: Account = {
    id,
    name: input.name,
    bank: input.bank || input.name,
    type: input.type,
    currency: input.currency ?? 'PHP',
    openingBalance: input.openingBalance ?? 0,
    isIncomeSource: input.isIncomeSource,
    color: input.color,
    icon: input.icon,
    archived: false,
    sortOrder: (maxSort == null ? -1 : Number(maxSort)) + 1,
    createdAt: ts,
    updatedAt: ts,
  }
  await insertRow('accounts', asRow(account))
  emitChange()
  return id
}

/** Patch an account; always bumps updatedAt. */
export async function updateAccount(
  id: string,
  patch: Partial<Omit<Account, 'id' | 'createdAt'>>,
): Promise<void> {
  await updateRow('accounts', id, { ...patch, updatedAt: now() })
  emitChange()
}

/** Soft-archive (hide) an account without deleting its history. */
export async function archiveAccount(id: string, archived = true): Promise<void> {
  await updateAccount(id, { archived })
}

/** Permanently delete an account and every transaction + recurring rule on it. */
export async function deleteAccount(id: string): Promise<void> {
  await withTransaction(async () => {
    await run('DELETE FROM transactions WHERE accountId=?', [id])
    await run('DELETE FROM recurring WHERE accountId=?', [id])
    await run('DELETE FROM accounts WHERE id=?', [id])
  })
  emitChange()
}

// ------------------------------------------------------------ transactions ---

export type NewTxnInput = Pick<Transaction, 'accountId' | 'amount' | 'type' | 'date'> &
  Partial<
    Pick<
      Transaction,
      'categoryId' | 'goalId' | 'note' | 'importBatchId' | 'importHash' | 'recurringId' | 'pendingId'
    >
  >

function buildTxn(input: NewTxnInput): Transaction {
  const ts = now()
  return {
    id: newId(),
    accountId: input.accountId,
    amount: input.amount,
    type: input.type,
    categoryId: input.categoryId,
    goalId: input.goalId,
    date: input.date,
    note: input.note,
    importBatchId: input.importBatchId,
    importHash: input.importHash,
    recurringId: input.recurringId,
    pendingId: input.pendingId,
    createdAt: ts,
    updatedAt: ts,
  }
}

/** Add a plain income/expense/adjustment txn. Returns its id. */
export async function addTransaction(input: NewTxnInput): Promise<string> {
  const t = buildTxn(input)
  await insertRow('transactions', asRow(t))
  emitChange()
  return t.id
}

export async function updateTransaction(
  id: string,
  patch: Partial<Omit<Transaction, 'id' | 'createdAt'>>,
): Promise<void> {
  await updateRow('transactions', id, { ...patch, updatedAt: now() })
  emitChange()
}

/**
 * Delete a transaction. If it is one leg of a transfer, delete BOTH legs
 * (same transferGroupId) so a transfer can never become half a transaction.
 */
export async function deleteTransaction(id: string): Promise<void> {
  await withTransaction(async () => {
    const t = await getTransaction(id)
    if (!t) return
    if (t.transferGroupId) {
      await run('DELETE FROM transactions WHERE transferGroupId=?', [t.transferGroupId])
    } else {
      await run('DELETE FROM transactions WHERE id=?', [id])
    }
  })
  emitChange()
}

/**
 * Reconcile an account to a real-world balance by inserting an `adjustment`
 * txn equal to (realBalance − computedBalance). History is never edited.
 */
export async function adjustBalance(
  accountId: string,
  realBalance: number,
  date = now(),
): Promise<void> {
  const acct = await getAccount(accountId)
  if (!acct) return
  const txns = await getTransactionsByAccount(accountId)
  const computed = txns.reduce((s, t) => s + t.amount, acct.openingBalance)
  const delta = realBalance - computed
  if (delta === 0) return
  await addTransaction({ accountId, amount: delta, type: 'adjustment', date })
}

/**
 * Create a transfer as two linked legs sharing a transferGroupId: −amount out
 * of `from`, +amount into `to`. `amount` is a positive minor-unit magnitude.
 */
export async function addTransfer(input: {
  fromAccountId: string
  toAccountId: string
  amount: number
  date: number
  note?: string
}): Promise<string> {
  const groupId = newId()
  const ts = now()
  const mag = Math.abs(input.amount)
  const legs: Transaction[] = [
    {
      id: newId(),
      accountId: input.fromAccountId,
      amount: -mag,
      type: 'transfer',
      transferAccountId: input.toAccountId,
      transferGroupId: groupId,
      date: input.date,
      note: input.note,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: newId(),
      accountId: input.toAccountId,
      amount: mag,
      type: 'transfer',
      transferAccountId: input.fromAccountId,
      transferGroupId: groupId,
      date: input.date,
      note: input.note,
      createdAt: ts,
      updatedAt: ts,
    },
  ]
  await withTransaction(async () => {
    for (const leg of legs) await insertRow('transactions', asRow(leg))
  })
  emitChange()
  return groupId
}

/** Edit both legs of a transfer at once (amount magnitude, date, note). */
export async function updateTransfer(
  groupId: string,
  patch: { amount?: number; date?: number; note?: string },
): Promise<void> {
  const ts = now()
  await withTransaction(async () => {
    const legs = (
      await query('SELECT * FROM transactions WHERE transferGroupId=?', [groupId])
    ).map(transactionFromRow)
    for (const leg of legs) {
      const next: Partial<Transaction> = { updatedAt: ts }
      if (patch.amount !== undefined) {
        const mag = Math.abs(patch.amount)
        next.amount = leg.amount < 0 ? -mag : mag
      }
      if (patch.date !== undefined) next.date = patch.date
      if (patch.note !== undefined) next.note = patch.note || undefined
      await updateRow('transactions', leg.id, next)
    }
  })
  emitChange()
}

/** Re-assign a category to many transactions at once (Activity bulk action). */
export async function bulkRecategorize(ids: string[], categoryId: string): Promise<void> {
  const ts = now()
  await withTransaction(async () => {
    for (const id of ids) {
      await updateRow('transactions', id, { categoryId, updatedAt: ts })
    }
  })
  emitChange()
}

// -------------------------------------------------------------- categories ---

// Distinct brand dots for auto-colored custom categories (domain data, not UI
// theming — same idea as the seeded account dots in seed.ts).
const CATEGORY_COLORS = [
  '#3B82F6', '#22C55E', '#F97316', '#14B8A6', '#A855F7',
  '#EC4899', '#EAB308', '#06B6D4', '#EF4444', '#8B5CF6',
]

/** A dedup key for a category: same name (case-insensitive) + same kind. */
function catKey(name: string, kind: CategoryKind): string {
  return `${name.trim().toLowerCase()}\x00${kind}`
}

/**
 * Add a category — or reuse an existing one. Dedups by (name.toLowerCase()+kind)
 * so typing a name that already exists (e.g. "food") returns that category's id
 * instead of creating a duplicate. A color is auto-assigned when not given.
 */
export async function addCategory(input: {
  name: string
  kind: CategoryKind
  color?: string
  icon?: string
}): Promise<string> {
  const name = input.name.trim()
  const key = catKey(name, input.kind)
  const all = await getCategories()
  const existing = all.find((c) => catKey(c.name, c.kind) === key)
  if (existing) return existing.id

  const id = newId()
  const category: Category = {
    id,
    name,
    kind: input.kind,
    color: input.color ?? CATEGORY_COLORS[all.length % CATEGORY_COLORS.length],
    icon: input.icon,
  }
  await insertRow('categories', asRow(category))
  emitChange()
  return id
}

/** Rename / recolor a category. */
export async function updateCategory(
  id: string,
  patch: Partial<Omit<Category, 'id'>>,
): Promise<void> {
  await updateRow('categories', id, patch)
  emitChange()
}

/**
 * Delete a category. Transactions keep their history but become uncategorized
 * (categoryId cleared), and any per-category budget referencing it is removed —
 * a simple clear-and-remove so nothing dangles a deleted id.
 */
export async function deleteCategory(id: string): Promise<void> {
  await withTransaction(async () => {
    await run('UPDATE transactions SET categoryId=NULL, updatedAt=? WHERE categoryId=?', [now(), id])
    await run('DELETE FROM budgets WHERE categoryId=?', [id])
    await run('DELETE FROM categories WHERE id=?', [id])
  })
  emitChange()
}

// ----------------------------------------------------------------- budgets ---

export async function addBudget(input: {
  categoryId: string
  amount: number
  rollover?: boolean
}): Promise<string> {
  const id = newId()
  const ts = now()
  const budget: Budget = {
    id,
    categoryId: input.categoryId,
    amount: input.amount,
    period: 'monthly',
    rollover: input.rollover,
    createdAt: ts,
    updatedAt: ts,
  }
  await insertRow('budgets', asRow(budget))
  emitChange()
  return id
}

export async function updateBudget(
  id: string,
  patch: Partial<Omit<Budget, 'id' | 'createdAt'>>,
): Promise<void> {
  await updateRow('budgets', id, { ...patch, updatedAt: now() })
  emitChange()
}

export async function deleteBudget(id: string): Promise<void> {
  await run('DELETE FROM budgets WHERE id=?', [id])
  emitChange()
}

// ------------------------------------------------------------------- goals ---

export async function addGoal(input: {
  name: string
  targetAmount: number
  targetDate?: number
  linkedAccountId?: string
  color?: string
}): Promise<string> {
  const id = newId()
  const ts = now()
  const goal: Goal = {
    id,
    name: input.name,
    targetAmount: input.targetAmount,
    targetDate: input.targetDate,
    linkedAccountId: input.linkedAccountId,
    color: input.color,
    archived: false,
    createdAt: ts,
    updatedAt: ts,
  }
  await insertRow('goals', asRow(goal))
  emitChange()
  return id
}

export async function updateGoal(
  id: string,
  patch: Partial<Omit<Goal, 'id' | 'createdAt'>>,
): Promise<void> {
  await updateRow('goals', id, { ...patch, updatedAt: now() })
  emitChange()
}

export async function archiveGoal(id: string, archived = true): Promise<void> {
  await updateGoal(id, { archived })
}

/**
 * Canonical goal list: every non-archived goal, oldest first (creation order).
 * Shared by `useGoals` and tested directly so the whole list — not just the
 * first goal — is guaranteed to load.
 */
export async function listGoals(): Promise<Goal[]> {
  return (await query('SELECT * FROM goals WHERE archived=0 ORDER BY createdAt')).map(goalFromRow)
}

export async function deleteGoal(id: string): Promise<void> {
  await run('DELETE FROM goals WHERE id=?', [id])
  emitChange()
}

// ------------------------------------------------------------------ import ---

/** All importHashes already present on an account (for dedup). */
export async function getAccountImportHashes(accountId: string): Promise<Set<string>> {
  const rows = await query(
    'SELECT importHash FROM transactions WHERE accountId=? AND importHash IS NOT NULL',
    [accountId],
  )
  return new Set(rows.map((r) => String(r.importHash)))
}

export interface ImportResult {
  batchId: string
  added: number
  skipped: number
}

/**
 * Commit parsed statement rows to an account: dedups via importHash, groups
 * everything under one importBatchId (so it can be undone), and — crucially —
 * reconciles the account to a stated ending balance so imports never leave a
 * wrong balance (the bug Tarsi shipped).
 */
export async function commitImport(
  accountId: string,
  rows: ParsedRow[],
  opts: { categoryId?: string; endingBalance?: number } = {},
): Promise<ImportResult> {
  const batchId = newId()
  const ts = now()
  const existing = await getAccountImportHashes(accountId)
  const toAdd: Transaction[] = []
  for (const r of rows) {
    const h = importHash(accountId, r.date, r.amount, r.description)
    if (existing.has(h)) continue
    existing.add(h)
    toAdd.push({
      id: newId(),
      accountId,
      amount: r.amount,
      type: r.type,
      categoryId: opts.categoryId,
      date: r.date,
      note: r.description || undefined,
      importBatchId: batchId,
      importHash: h,
      createdAt: ts,
      updatedAt: ts,
    })
  }

  await withTransaction(async () => {
    for (const t of toAdd) await insertRow('transactions', asRow(t))
    if (opts.endingBalance != null) {
      const acct = await getAccount(accountId)
      if (acct) {
        const all = await getTransactionsByAccount(accountId)
        const computed = all.reduce((s, t) => s + t.amount, acct.openingBalance)
        const delta = opts.endingBalance - computed
        if (delta !== 0) {
          await insertRow(
            'transactions',
            asRow({
              id: newId(),
              accountId,
              amount: delta,
              type: 'adjustment',
              date: ts,
              note: 'Statement balance reconcile',
              importBatchId: batchId,
              createdAt: ts,
              updatedAt: ts,
            }),
          )
        }
      }
    }
  })

  emitChange()
  return { batchId, added: toAdd.length, skipped: rows.length - toAdd.length }
}

/** Undo a whole import batch (incl. its reconciliation adjustment). */
export async function undoImport(batchId: string): Promise<void> {
  await run('DELETE FROM transactions WHERE importBatchId=?', [batchId])
  emitChange()
}

// ------------------------------------------------------------------ backup ---

/** Snapshot every table into a portable backup object. */
export async function exportData(): Promise<BackupV1> {
  const [accounts, transactions, categories, budgets, goals, settingsRow, recurring] =
    await Promise.all([
      getAccounts(),
      getTransactions(),
      getCategories(),
      getBudgets(),
      getGoals(),
      getSettings(),
      getRecurring(),
    ])
  return buildBackup(
    {
      accounts,
      transactions,
      categories,
      budgets,
      goals,
      settings: settingsRow ? [settingsRow] : [],
      recurring,
    },
    now(),
  )
}

/**
 * Replace ALL data with a validated backup (used by Import backup / restore).
 *
 * Restore is the recovery path, so a bad file must never empty the DB:
 *  1. `isValidBackup` validates every row (incl. non-empty ids) BEFORE we touch
 *     the DB — a malformed-but-plausible file is rejected with no mutation.
 *  2. The clear + inserts run in ONE transaction, so if any insert still throws
 *     the whole thing rolls back and the existing data is left intact.
 */
export async function importData(backup: unknown): Promise<void> {
  if (!isValidBackup(backup)) throw new Error('Not a valid Pera backup file.')
  const { accounts, transactions, categories, budgets, goals, settings } = backup
  const recurring = backup.recurring ?? []
  await withTransaction(async () => {
    for (const t of TABLES) await run(`DELETE FROM ${t}`)
    for (const a of accounts) await insertRow('accounts', asRow(a))
    for (const t of transactions) await insertRow('transactions', asRow(t))
    for (const c of categories) await insertRow('categories', asRow(c))
    for (const b of budgets) await insertRow('budgets', asRow(b))
    for (const g of goals) await insertRow('goals', asRow(g))
    for (const s of settings) await insertRow('settings', asRow(s))
    for (const r of recurring) await insertRow('recurring', asRow(r))
  })
  emitChange()
}

/** Wipe all data (accounts, transactions, budgets, goals, categories, settings). */
export async function clearAllData(): Promise<void> {
  await withTransaction(async () => {
    for (const t of TABLES) await run(`DELETE FROM ${t}`)
  })
  emitChange()
}

// ------------------------------------------------------------- settings ------

/** Patch the settings singleton and notify subscribers. */
async function patchSettings(patch: Partial<Settings>): Promise<void> {
  await updateRow('settings', 'singleton', asRow(patch))
  emitChange()
}

/** Generic settings patch (Settings screen + tests). */
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await patchSettings(patch)
}

/** Stamp the last-backup time on the settings singleton. */
export async function markBackedUp(): Promise<void> {
  await patchSettings({ lastBackupAt: now() })
}

/** Persist the chosen theme into settings (UI also keeps a localStorage copy). */
export async function setThemePref(theme: 'system' | 'light' | 'dark'): Promise<void> {
  await patchSettings({ theme })
}

/** Set (or clear, with undefined) the overall monthly budget — minor units. */
export async function setMonthlyBudget(amount: number | undefined): Promise<void> {
  await patchSettings({ monthlyBudget: amount })
}

/** Set (or clear) the default account quick-add posts to. */
export async function setDefaultAccount(accountId: string | undefined): Promise<void> {
  await patchSettings({ defaultAccountId: accountId })
}

// ------------------------------------------------- widget quick-add presets ---

/**
 * A dedup key for a preset: same *action* = same type + amount + category +
 * account. Two "Save as quick-add" taps on an identical expense collapse to one
 * button instead of stacking duplicates (mirrors `catKey`'s approach).
 */
function presetKey(
  p: Pick<QuickAddPreset, 'type' | 'amount' | 'categoryId' | 'accountId'>,
): string {
  return [p.type, p.amount, p.categoryId ?? '', p.accountId ?? ''].join('\x00')
}

/**
 * Insert or update a quick-add preset in the settings list. Matching order:
 *  1. If the preset carries an `id` that already exists → replace it in place
 *     (the Settings editor's edit path).
 *  2. Otherwise dedupe by action (`presetKey`) — saving the same combo twice
 *     (e.g. "Save as quick-add" on an identical expense) refreshes the existing
 *     preset's label instead of adding a twin, keeping its id.
 *  3. Otherwise append, assigning a fresh id when one wasn't supplied.
 */
export async function upsertPreset(
  preset: Omit<QuickAddPreset, 'id'> & { id?: string },
): Promise<void> {
  const s = await getSettings()
  const list = s?.quickAddPresets ?? []

  const byId = preset.id ? list.findIndex((p) => p.id === preset.id) : -1
  if (byId >= 0) {
    const withId = { ...preset, id: preset.id! }
    await patchSettings({ quickAddPresets: list.map((p, i) => (i === byId ? withId : p)) })
    return
  }

  const key = presetKey(preset)
  const dup = list.findIndex((p) => presetKey(p) === key)
  if (dup >= 0) {
    // Same action already saved — keep its id, refresh its label; no duplicate.
    await patchSettings({
      quickAddPresets: list.map((p, i) => (i === dup ? { ...preset, id: p.id } : p)),
    })
    return
  }

  await patchSettings({
    quickAddPresets: [...list, { ...preset, id: preset.id || newId() }],
  })
}

/** Remove a quick-add preset by id. */
export async function deletePreset(id: string): Promise<void> {
  const s = await getSettings()
  const next = (s?.quickAddPresets ?? []).filter((p) => p.id !== id)
  await patchSettings({ quickAddPresets: next })
}

/**
 * Contribute to a goal — without ever fabricating money (a contribution
 * earmarks money you already have, it isn't income).
 *
 * - **Linked goal** (backed by a real account): a real **transfer** of
 *   `amount` from `accountId` into the goal's linked account. Progress is that
 *   account's balance; the transfer nets to zero, so net worth is unchanged.
 * - **Virtual goal** (no linked account): a neutral `goal` earmark txn tagged
 *   with the goalId. `goalProgress` sums it, but it is excluded from every
 *   balance / net-worth / income / expense calculation.
 */
export async function contributeToGoal(input: {
  goalId: string
  accountId: string
  amount: number
  date: number
  note?: string
}): Promise<string> {
  const mag = Math.abs(input.amount)
  const goal = await getGoal(input.goalId)

  if (goal?.linkedAccountId && goal.linkedAccountId !== input.accountId) {
    return addTransfer({
      fromAccountId: input.accountId,
      toAccountId: goal.linkedAccountId,
      amount: mag,
      date: input.date,
      note: input.note,
    })
  }

  return addTransaction({
    accountId: input.accountId,
    amount: mag,
    type: 'goal',
    goalId: input.goalId,
    date: input.date,
    note: input.note,
  })
}

// --------------------------------------------------------------- recurring ---

export type NewRecurringInput = {
  accountId: string
  type: 'income' | 'expense'
  amount: number // positive magnitude, minor units
  categoryId?: string
  note?: string
  freq: RecurringFreq
  interval: number
  anchorDay?: number
  startDate: number
  endDate?: number
  autoPost: boolean
}

/** Resolve the anchor for a rule: explicit, else derived from a seed date. */
function anchorFor(freq: RecurringFreq, anchorDay: number | undefined, seed: number): number {
  if (anchorDay != null) return anchorDay
  const d = new Date(seed)
  return freq === 'weekly' ? d.getDay() : d.getDate()
}

/** Create a recurring rule; seeds nextRunDate as the first occurrence on/after startDate. */
export async function addRecurring(input: NewRecurringInput): Promise<string> {
  const id = newId()
  const ts = now()
  const anchor = anchorFor(input.freq, input.anchorDay, input.startDate)
  const interval = Math.max(1, Math.floor(input.interval))
  const rule: RecurringRule = {
    id,
    accountId: input.accountId,
    type: input.type,
    amount: Math.abs(input.amount),
    categoryId: input.categoryId,
    note: input.note,
    freq: input.freq,
    interval,
    anchorDay: anchor,
    startDate: input.startDate,
    endDate: input.endDate,
    nextRunDate: nextDate(input.freq, interval, anchor, input.startDate),
    autoPost: input.autoPost,
    archived: false,
    createdAt: ts,
    updatedAt: ts,
  }
  await insertRow('recurring', asRow(rule))
  emitChange()
  return id
}

/** Patch a rule; if any schedule field changes, re-seed nextRunDate from startDate. */
export async function updateRecurring(
  id: string,
  patch: Partial<Omit<RecurringRule, 'id' | 'createdAt'>>,
): Promise<void> {
  const ts = now()
  const existing = await getRecurringById(id)
  if (!existing) return
  const merged = { ...existing, ...patch }
  const scheduleChanged =
    patch.freq !== undefined ||
    patch.interval !== undefined ||
    patch.anchorDay !== undefined ||
    patch.startDate !== undefined
  const next: Partial<RecurringRule> = { ...patch, updatedAt: ts }
  if (patch.amount !== undefined) next.amount = Math.abs(patch.amount)
  if (scheduleChanged) {
    const interval = Math.max(1, Math.floor(merged.interval))
    const anchor = anchorFor(merged.freq, merged.anchorDay, merged.startDate)
    next.interval = interval
    next.anchorDay = anchor
    next.nextRunDate = nextDate(merged.freq, interval, anchor, merged.startDate)
  }
  await updateRow('recurring', id, next)
  emitChange()
}

export async function archiveRecurring(id: string, archived = true): Promise<void> {
  await updateRow('recurring', id, { archived, updatedAt: now() })
  emitChange()
}

export async function deleteRecurring(id: string): Promise<void> {
  await run('DELETE FROM recurring WHERE id=?', [id])
  emitChange()
}

/** Non-archived rules, soonest next run first. */
export async function listRecurring(): Promise<RecurringRule[]> {
  return (await query('SELECT * FROM recurring WHERE archived=0 ORDER BY nextRunDate')).map(
    recurringFromRow,
  )
}

const signedAmount = (r: RecurringRule): number =>
  r.type === 'income' ? Math.abs(r.amount) : -Math.abs(r.amount)

/**
 * Post every due occurrence of every auto-post rule up to `nowMs`, in one
 * transaction. Idempotent: dedupes on (recurringId + date) so reopening the app
 * never double-posts, and advances nextRunDate/lastPostedDate. Manual ("remind
 * me") rules are left untouched so they surface as upcoming/overdue. Safe to
 * call on every app start. Returns how many transactions were created.
 */
export async function processDueRecurring(nowMs: number = now()): Promise<number> {
  let posted = 0
  let changed = false
  await withTransaction(async () => {
    const rules = (await query('SELECT * FROM recurring WHERE archived=0')).map(recurringFromRow)
    for (const rule of rules) {
      const due = dueDates(rule, nowMs)
      if (due.length === 0 || !rule.autoPost) continue

      const existing = await query(
        'SELECT date FROM transactions WHERE accountId=? AND recurringId=?',
        [rule.accountId, rule.id],
      )
      const have = new Set(existing.map((r) => Number(r.date)))
      const ts = now()
      const amount = signedAmount(rule)
      for (const date of due) {
        if (have.has(date)) continue
        await insertRow(
          'transactions',
          asRow({
            id: newId(),
            accountId: rule.accountId,
            amount,
            type: rule.type,
            categoryId: rule.categoryId,
            date,
            note: rule.note,
            recurringId: rule.id,
            createdAt: ts,
            updatedAt: ts,
          }),
        )
        have.add(date)
        posted++
      }
      const last = due[due.length - 1]
      await updateRow('recurring', rule.id, {
        nextRunDate: nextAfter(rule, last),
        lastPostedDate: last,
        updatedAt: ts,
      })
      changed = true
    }
  })
  if (changed) emitChange()
  return posted
}

/** Post the current due occurrence of a rule once (the manual "Add" button). */
export async function postRecurringNow(ruleId: string): Promise<void> {
  await withTransaction(async () => {
    const rule = await getRecurringById(ruleId)
    if (!rule || rule.archived) return
    const date = startOfDay(rule.nextRunDate)
    if (rule.endDate != null && date > rule.endDate) return
    const existing = await query(
      'SELECT id FROM transactions WHERE accountId=? AND recurringId=? AND date=?',
      [rule.accountId, rule.id, date],
    )
    const ts = now()
    if (existing.length === 0) {
      await insertRow(
        'transactions',
        asRow({
          id: newId(),
          accountId: rule.accountId,
          amount: signedAmount(rule),
          type: rule.type,
          categoryId: rule.categoryId,
          date,
          note: rule.note,
          recurringId: rule.id,
          createdAt: ts,
          updatedAt: ts,
        }),
      )
    }
    await updateRow('recurring', rule.id, {
      nextRunDate: nextAfter(rule, date),
      lastPostedDate: date,
      updatedAt: ts,
    })
  })
  emitChange()
}
