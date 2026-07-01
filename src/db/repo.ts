// Centralized write layer. Every mutation flows through here so ids, timestamps
// and invariants (transfer pairs, adjustments) live in one place — and so a
// future native widget / share-intent can reuse the exact same entry points.

import { db, newId, now } from './db'
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
} from './types'
import { importHash, type ParsedRow } from '../lib/importing'
import { buildBackup, isValidBackup, type BackupV1 } from '../lib/backup'
import { dueDates, nextDate, nextAfter } from '../lib/recurring'
import { startOfDay } from '../lib/dates'
import { parsePendingQueue, planDrain, type PendingTxn } from '../lib/pending'
import { readPendingRaw, clearPendingQueue } from '../native/pendingStore'

// ---------------------------------------------------------------- accounts ---

export type NewAccountInput = Pick<Account, 'name' | 'bank' | 'type'> &
  Partial<Pick<Account, 'currency' | 'openingBalance' | 'isIncomeSource' | 'color' | 'icon'>>

/** Insert a new account at the end of the sort order. Returns its id. */
export async function addAccount(input: NewAccountInput): Promise<string> {
  const id = newId()
  const ts = now()
  const maxSort = await db.accounts.orderBy('sortOrder').last()
  await db.accounts.add({
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
    sortOrder: (maxSort?.sortOrder ?? -1) + 1,
    createdAt: ts,
    updatedAt: ts,
  })
  return id
}

/** Patch an account; always bumps updatedAt. */
export async function updateAccount(
  id: string,
  patch: Partial<Omit<Account, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.accounts.update(id, { ...patch, updatedAt: now() })
}

/** Soft-archive (hide) an account without deleting its history. */
export async function archiveAccount(id: string, archived = true): Promise<void> {
  await updateAccount(id, { archived })
}

/** Permanently delete an account and every transaction + recurring rule on it. */
export async function deleteAccount(id: string): Promise<void> {
  await db.transaction('rw', db.accounts, db.transactions, db.recurring, async () => {
    await db.transactions.where('accountId').equals(id).delete()
    await db.recurring.where('accountId').equals(id).delete()
    await db.accounts.delete(id)
  })
}

// ------------------------------------------------------------ transactions ---

export type NewTxnInput = Pick<Transaction, 'accountId' | 'amount' | 'type' | 'date'> &
  Partial<
    Pick<
      Transaction,
      'categoryId' | 'goalId' | 'note' | 'importBatchId' | 'importHash' | 'recurringId' | 'pendingId'
    >
  >

/** Add a plain income/expense/adjustment txn. Returns its id. */
export async function addTransaction(input: NewTxnInput): Promise<string> {
  const id = newId()
  const ts = now()
  await db.transactions.add({
    id,
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
  })
  return id
}

export async function updateTransaction(
  id: string,
  patch: Partial<Omit<Transaction, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.transactions.update(id, { ...patch, updatedAt: now() })
}

/**
 * Delete a transaction. If it is one leg of a transfer, delete BOTH legs
 * (same transferGroupId) so a transfer can never become half a transaction.
 */
export async function deleteTransaction(id: string): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    const t = await db.transactions.get(id)
    if (!t) return
    if (t.transferGroupId) {
      await db.transactions.where('transferGroupId').equals(t.transferGroupId).delete()
    } else {
      await db.transactions.delete(id)
    }
  })
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
  const acct = await db.accounts.get(accountId)
  if (!acct) return
  const txns = await db.transactions.where('accountId').equals(accountId).toArray()
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
  await db.transactions.bulkAdd([
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
  ])
  return groupId
}

/** Edit both legs of a transfer at once (amount magnitude, date, note). */
export async function updateTransfer(
  groupId: string,
  patch: { amount?: number; date?: number; note?: string },
): Promise<void> {
  const ts = now()
  await db.transaction('rw', db.transactions, async () => {
    const legs = await db.transactions.where('transferGroupId').equals(groupId).toArray()
    for (const leg of legs) {
      const next: Partial<Transaction> = { updatedAt: ts }
      if (patch.amount !== undefined) {
        const mag = Math.abs(patch.amount)
        next.amount = leg.amount < 0 ? -mag : mag
      }
      if (patch.date !== undefined) next.date = patch.date
      if (patch.note !== undefined) next.note = patch.note || undefined
      await db.transactions.update(leg.id, next)
    }
  })
}

/** Re-assign a category to many transactions at once (Activity bulk action). */
export async function bulkRecategorize(ids: string[], categoryId: string): Promise<void> {
  const ts = now()
  await db.transaction('rw', db.transactions, async () => {
    for (const id of ids) {
      await db.transactions.update(id, { categoryId, updatedAt: ts })
    }
  })
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
  const existing = (await db.categories.toArray()).find(
    (c) => catKey(c.name, c.kind) === key,
  )
  if (existing) return existing.id

  const id = newId()
  const count = await db.categories.count()
  await db.categories.add({
    id,
    name,
    kind: input.kind,
    color: input.color ?? CATEGORY_COLORS[count % CATEGORY_COLORS.length],
    icon: input.icon,
  })
  return id
}

/** Rename / recolor a category. */
export async function updateCategory(
  id: string,
  patch: Partial<Omit<Category, 'id'>>,
): Promise<void> {
  await db.categories.update(id, patch)
}

/**
 * Delete a category. Transactions keep their history but become uncategorized
 * (categoryId cleared), and any per-category budget referencing it is removed —
 * a simple clear-and-remove so nothing dangles a deleted id.
 */
export async function deleteCategory(id: string): Promise<void> {
  await db.transaction('rw', db.transactions, db.budgets, db.categories, async () => {
    const txns = await db.transactions.where('categoryId').equals(id).toArray()
    const ts = now()
    for (const t of txns) {
      await db.transactions.update(t.id, { categoryId: undefined, updatedAt: ts })
    }
    await db.budgets.where('categoryId').equals(id).delete()
    await db.categories.delete(id)
  })
}

// ----------------------------------------------------------------- budgets ---

export async function addBudget(input: {
  categoryId: string
  amount: number
  rollover?: boolean
}): Promise<string> {
  const id = newId()
  const ts = now()
  await db.budgets.add({
    id,
    categoryId: input.categoryId,
    amount: input.amount,
    period: 'monthly',
    rollover: input.rollover,
    createdAt: ts,
    updatedAt: ts,
  })
  return id
}

export async function updateBudget(
  id: string,
  patch: Partial<Omit<Budget, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.budgets.update(id, { ...patch, updatedAt: now() })
}

export async function deleteBudget(id: string): Promise<void> {
  await db.budgets.delete(id)
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
  await db.goals.add({
    id,
    name: input.name,
    targetAmount: input.targetAmount,
    targetDate: input.targetDate,
    linkedAccountId: input.linkedAccountId,
    color: input.color,
    archived: false,
    createdAt: ts,
    updatedAt: ts,
  })
  return id
}

export async function updateGoal(
  id: string,
  patch: Partial<Omit<Goal, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.goals.update(id, { ...patch, updatedAt: now() })
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
  const rows = await db.goals.toArray()
  return rows.filter((g) => !g.archived).sort((a, b) => a.createdAt - b.createdAt)
}

export async function deleteGoal(id: string): Promise<void> {
  await db.goals.delete(id)
}

// ------------------------------------------------------------------ import ---

/** All importHashes already present on an account (for dedup). */
export async function getAccountImportHashes(accountId: string): Promise<Set<string>> {
  const rows = await db.transactions.where('accountId').equals(accountId).toArray()
  return new Set(rows.map((r) => r.importHash).filter(Boolean) as string[])
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

  await db.transaction('rw', db.accounts, db.transactions, async () => {
    if (toAdd.length) await db.transactions.bulkAdd(toAdd)
    if (opts.endingBalance != null) {
      const acct = await db.accounts.get(accountId)
      if (acct) {
        const all = await db.transactions.where('accountId').equals(accountId).toArray()
        const computed = all.reduce((s, t) => s + t.amount, acct.openingBalance)
        const delta = opts.endingBalance - computed
        if (delta !== 0) {
          await db.transactions.add({
            id: newId(),
            accountId,
            amount: delta,
            type: 'adjustment',
            date: ts,
            note: 'Statement balance reconcile',
            importBatchId: batchId,
            createdAt: ts,
            updatedAt: ts,
          })
        }
      }
    }
  })

  return { batchId, added: toAdd.length, skipped: rows.length - toAdd.length }
}

/** Undo a whole import batch (incl. its reconciliation adjustment). */
export async function undoImport(batchId: string): Promise<void> {
  await db.transactions.where('importBatchId').equals(batchId).delete()
}

// ------------------------------------------------------------------ backup ---

/** Snapshot every table into a portable backup object. */
export async function exportData(): Promise<BackupV1> {
  const [accounts, transactions, categories, budgets, goals, settings, recurring] =
    await Promise.all([
      db.accounts.toArray(),
      db.transactions.toArray(),
      db.categories.toArray(),
      db.budgets.toArray(),
      db.goals.toArray(),
      db.settings.toArray(),
      db.recurring.toArray(),
    ])
  return buildBackup(
    { accounts, transactions, categories, budgets, goals, settings, recurring },
    now(),
  )
}

/**
 * Replace ALL data with a validated backup (used by Import backup / restore).
 *
 * Restore is the recovery path, so a bad file must never empty the DB:
 *  1. `isValidBackup` validates every row (incl. non-empty ids) BEFORE we touch
 *     the DB — a malformed-but-plausible file is rejected with no mutation.
 *  2. The clear + bulkAdd run in ONE `rw` transaction, so if any insert still
 *     throws the whole thing rolls back and the existing data is left intact.
 */
export async function importData(backup: unknown): Promise<void> {
  if (!isValidBackup(backup)) throw new Error('Not a valid Pera backup file.')
  const { accounts, transactions, categories, budgets, goals, settings } = backup
  const recurring = backup.recurring ?? []
  await db.transaction(
    'rw',
    [db.accounts, db.transactions, db.categories, db.budgets, db.goals, db.settings, db.recurring],
    async () => {
      await Promise.all([
        db.accounts.clear(),
        db.transactions.clear(),
        db.categories.clear(),
        db.budgets.clear(),
        db.goals.clear(),
        db.settings.clear(),
        db.recurring.clear(),
      ])
      await Promise.all([
        db.accounts.bulkAdd(accounts),
        db.transactions.bulkAdd(transactions),
        db.categories.bulkAdd(categories),
        db.budgets.bulkAdd(budgets),
        db.goals.bulkAdd(goals),
        db.settings.bulkAdd(settings),
        db.recurring.bulkAdd(recurring),
      ])
    },
  )
}

/** Wipe all data (accounts, transactions, budgets, goals, categories, settings). */
export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.accounts, db.transactions, db.categories, db.budgets, db.goals, db.settings, db.recurring],
    async () => {
      await Promise.all([
        db.accounts.clear(),
        db.transactions.clear(),
        db.categories.clear(),
        db.budgets.clear(),
        db.goals.clear(),
        db.settings.clear(),
        db.recurring.clear(),
      ])
    },
  )
}

/** Stamp the last-backup time on the settings singleton. */
export async function markBackedUp(): Promise<void> {
  await db.settings.update('singleton', { lastBackupAt: now() })
}

/** Persist the chosen theme into settings (UI also keeps a localStorage copy). */
export async function setThemePref(theme: 'system' | 'light' | 'dark'): Promise<void> {
  await db.settings.update('singleton', { theme })
}

/** Set (or clear, with undefined) the overall monthly budget — minor units. */
export async function setMonthlyBudget(amount: number | undefined): Promise<void> {
  await db.settings.update('singleton', { monthlyBudget: amount })
}

/** Set (or clear) the default account quick-add posts to. */
export async function setDefaultAccount(accountId: string | undefined): Promise<void> {
  await db.settings.update('singleton', { defaultAccountId: accountId })
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
  const s = await db.settings.get('singleton')
  const list = s?.quickAddPresets ?? []

  const byId = preset.id ? list.findIndex((p) => p.id === preset.id) : -1
  if (byId >= 0) {
    const withId = { ...preset, id: preset.id! }
    await db.settings.update('singleton', {
      quickAddPresets: list.map((p, i) => (i === byId ? withId : p)),
    })
    return
  }

  const key = presetKey(preset)
  const dup = list.findIndex((p) => presetKey(p) === key)
  if (dup >= 0) {
    // Same action already saved — keep its id, refresh its label; no duplicate.
    await db.settings.update('singleton', {
      quickAddPresets: list.map((p, i) => (i === dup ? { ...preset, id: p.id } : p)),
    })
    return
  }

  await db.settings.update('singleton', {
    quickAddPresets: [...list, { ...preset, id: preset.id || newId() }],
  })
}

/** Remove a quick-add preset by id. */
export async function deletePreset(id: string): Promise<void> {
  const s = await db.settings.get('singleton')
  const next = (s?.quickAddPresets ?? []).filter((p) => p.id !== id)
  await db.settings.update('singleton', { quickAddPresets: next })
}

// ------------------------------------------------- widget pending-log queue ---

/**
 * Import a batch of native widget pending-logs into IndexedDB. Idempotent by
 * pending id: a record whose id already landed (it carries `pendingId`) is
 * skipped, so re-draining an un-cleared queue never double-posts. Returns the
 * number actually added. Pure-ish — the dedupe decision lives in `planDrain`.
 */
export async function drainPendingTxns(pending: PendingTxn[]): Promise<number> {
  if (pending.length === 0) return 0
  const existing = new Set(
    (await db.transactions.toArray()).map((t) => t.pendingId).filter(Boolean) as string[],
  )
  const { toAdd } = planDrain(pending, existing)
  for (const item of toAdd) {
    await addTransaction({
      accountId: item.accountId,
      amount: item.amount,
      type: item.type,
      categoryId: item.categoryId,
      date: item.date,
      pendingId: item.id,
    })
  }
  return toAdd.length
}

/**
 * Read the native widget pending queue, drain it into IndexedDB (idempotent),
 * and clear it. Safe to call on every app start; a no-op on web (empty queue).
 * Returns how many transactions were imported.
 */
export async function drainPendingQueue(): Promise<number> {
  const pending = parsePendingQueue(await readPendingRaw())
  if (pending.length === 0) return 0
  const added = await drainPendingTxns(pending)
  await clearPendingQueue()
  return added
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
  const goal = await db.goals.get(input.goalId)

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
  await db.recurring.add({
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
  })
  return id
}

/** Patch a rule; if any schedule field changes, re-seed nextRunDate from startDate. */
export async function updateRecurring(
  id: string,
  patch: Partial<Omit<RecurringRule, 'id' | 'createdAt'>>,
): Promise<void> {
  const ts = now()
  const existing = await db.recurring.get(id)
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
  await db.recurring.update(id, next)
}

export async function archiveRecurring(id: string, archived = true): Promise<void> {
  await db.recurring.update(id, { archived, updatedAt: now() })
}

export async function deleteRecurring(id: string): Promise<void> {
  await db.recurring.delete(id)
}

/** Non-archived rules, soonest next run first. */
export async function listRecurring(): Promise<RecurringRule[]> {
  const rows = await db.recurring.toArray()
  return rows.filter((r) => !r.archived).sort((a, b) => a.nextRunDate - b.nextRunDate)
}

const signedAmount = (r: RecurringRule): number =>
  r.type === 'income' ? Math.abs(r.amount) : -Math.abs(r.amount)

/**
 * Post every due occurrence of every auto-post rule up to `nowMs`, in one rw
 * transaction. Idempotent: dedupes on (recurringId + date) so reopening the app
 * never double-posts, and advances nextRunDate/lastPostedDate. Manual ("remind
 * me") rules are left untouched so they surface as upcoming/overdue. Safe to
 * call on every app start. Returns how many transactions were created.
 */
export async function processDueRecurring(nowMs: number = now()): Promise<number> {
  let posted = 0
  await db.transaction('rw', db.recurring, db.transactions, async () => {
    const rules = (await db.recurring.toArray()).filter((r) => !r.archived)
    for (const rule of rules) {
      const due = dueDates(rule, nowMs)
      if (due.length === 0 || !rule.autoPost) continue

      const onAccount = await db.transactions.where('accountId').equals(rule.accountId).toArray()
      const have = new Set(
        onAccount.filter((t) => t.recurringId === rule.id).map((t) => t.date),
      )
      const ts = now()
      const amount = signedAmount(rule)
      for (const date of due) {
        if (have.has(date)) continue
        await db.transactions.add({
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
        })
        have.add(date)
        posted++
      }
      const last = due[due.length - 1]
      await db.recurring.update(rule.id, {
        nextRunDate: nextAfter(rule, last),
        lastPostedDate: last,
        updatedAt: ts,
      })
    }
  })
  return posted
}

/** Post the current due occurrence of a rule once (the manual "Add" button). */
export async function postRecurringNow(ruleId: string): Promise<void> {
  await db.transaction('rw', db.recurring, db.transactions, async () => {
    const rule = await db.recurring.get(ruleId)
    if (!rule || rule.archived) return
    const date = startOfDay(rule.nextRunDate)
    if (rule.endDate != null && date > rule.endDate) return
    const onAccount = await db.transactions.where('accountId').equals(rule.accountId).toArray()
    const dup = onAccount.some((t) => t.recurringId === rule.id && t.date === date)
    const ts = now()
    if (!dup) {
      await db.transactions.add({
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
      })
    }
    await db.recurring.update(rule.id, {
      nextRunDate: nextAfter(rule, date),
      lastPostedDate: date,
      updatedAt: ts,
    })
  })
}
