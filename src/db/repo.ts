// Centralized write layer. Every mutation flows through here so ids, timestamps
// and invariants (transfer pairs, adjustments) live in one place — and so a
// future native widget / share-intent can reuse the exact same entry points.

import { db, newId, now } from './db'
import type { Account, Transaction } from './types'

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

/** Permanently delete an account and every transaction on it. */
export async function deleteAccount(id: string): Promise<void> {
  await db.transaction('rw', db.accounts, db.transactions, async () => {
    await db.transactions.where('accountId').equals(id).delete()
    await db.accounts.delete(id)
  })
}

// ------------------------------------------------------------ transactions ---

export type NewTxnInput = Pick<Transaction, 'accountId' | 'amount' | 'type' | 'date'> &
  Partial<Pick<Transaction, 'categoryId' | 'goalId' | 'note' | 'importBatchId' | 'importHash'>>

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

/** Re-assign a category to many transactions at once (Activity bulk action). */
export async function bulkRecategorize(ids: string[], categoryId: string): Promise<void> {
  const ts = now()
  await db.transaction('rw', db.transactions, async () => {
    for (const id of ids) {
      await db.transactions.update(id, { categoryId, updatedAt: ts })
    }
  })
}
