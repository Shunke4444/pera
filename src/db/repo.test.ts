import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import {
  addAccount,
  addTransaction,
  addTransfer,
  deleteTransaction,
  adjustBalance,
  updateTransfer,
  bulkRecategorize,
  commitImport,
  undoImport,
  exportData,
  importData,
  clearAllData,
  addGoal,
  contributeToGoal,
} from './repo'
import { seedIfEmpty } from './seed'
import { accountBalance, netWorth, goalProgress } from '../lib/balances'
import type { ParsedRow } from '../lib/importing'
import type { Transaction } from './types'

/** Σ of income txn amounts — the "total income" a contribution must never inflate. */
function totalIncome(txns: Transaction[]): number {
  return txns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function twoAccounts() {
  const a = await addAccount({ name: 'GCash', bank: 'GCash', type: 'ewallet', openingBalance: 10000 })
  const b = await addAccount({ name: 'Maya', bank: 'Maya', type: 'ewallet', openingBalance: 0 })
  return { a, b }
}

describe('addTransfer', () => {
  it('creates two linked legs that move money without creating it', async () => {
    const { a, b } = await twoAccounts()
    await addTransfer({ fromAccountId: a, toAccountId: b, amount: 3000, date: Date.now() })

    const accounts = await db.accounts.toArray()
    const txns = await db.transactions.toArray()
    expect(txns).toHaveLength(2)
    expect(txns.every((t) => t.type === 'transfer')).toBe(true)
    expect(txns[0].transferGroupId).toBe(txns[1].transferGroupId)

    const src = accounts.find((x) => x.id === a)!
    const dst = accounts.find((x) => x.id === b)!
    expect(accountBalance(src, txns)).toBe(7000)
    expect(accountBalance(dst, txns)).toBe(3000)
    expect(netWorth(accounts, txns)).toBe(10000)
  })
})

describe('deleteTransaction on a transfer leg', () => {
  it('removes BOTH legs of the transfer', async () => {
    const { a, b } = await twoAccounts()
    await addTransfer({ fromAccountId: a, toAccountId: b, amount: 3000, date: Date.now() })
    const oneLeg = (await db.transactions.toArray())[0]
    await deleteTransaction(oneLeg.id)
    expect(await db.transactions.count()).toBe(0)
  })

  it('removes only the targeted plain transaction', async () => {
    const { a } = await twoAccounts()
    const id = await addTransaction({ accountId: a, amount: -500, type: 'expense', date: Date.now() })
    await addTransaction({ accountId: a, amount: -250, type: 'expense', date: Date.now() })
    await deleteTransaction(id)
    expect(await db.transactions.count()).toBe(1)
  })
})

describe('adjustBalance', () => {
  it('inserts an adjustment so the computed balance equals reality', async () => {
    const { a } = await twoAccounts() // opening 10000
    await addTransaction({ accountId: a, amount: -2500, type: 'expense', date: Date.now() })
    // computed = 7500; user states real balance is 8000 → +500 adjustment
    await adjustBalance(a, 8000)
    const acct = (await db.accounts.get(a))!
    const txns = await db.transactions.where('accountId').equals(a).toArray()
    expect(accountBalance(acct, txns)).toBe(8000)
    expect(txns.filter((t) => t.type === 'adjustment')).toHaveLength(1)
  })

  it('is a no-op when already reconciled', async () => {
    const { a } = await twoAccounts()
    await adjustBalance(a, 10000) // already 10000
    expect(await db.transactions.count()).toBe(0)
  })
})

describe('updateTransfer', () => {
  it('keeps the legs opposite-signed when the amount changes', async () => {
    const { a, b } = await twoAccounts()
    const group = await addTransfer({ fromAccountId: a, toAccountId: b, amount: 3000, date: Date.now() })
    await updateTransfer(group, { amount: 5000 })
    const legs = await db.transactions.where('transferGroupId').equals(group).toArray()
    const amounts = legs.map((l) => l.amount).sort((x, y) => x - y)
    expect(amounts).toEqual([-5000, 5000])
  })
})

describe('bulkRecategorize', () => {
  it('sets the category on every given transaction', async () => {
    const { a } = await twoAccounts()
    const t1 = await addTransaction({ accountId: a, amount: -100, type: 'expense', date: Date.now() })
    const t2 = await addTransaction({ accountId: a, amount: -200, type: 'expense', date: Date.now() })
    await bulkRecategorize([t1, t2], 'groceries')
    const txns = await db.transactions.bulkGet([t1, t2])
    expect(txns.every((t) => t?.categoryId === 'groceries')).toBe(true)
  })
})

describe('commitImport / undoImport', () => {
  const rows: ParsedRow[] = [
    { date: new Date(2026, 5, 15).getTime(), amount: -150000, type: 'expense', description: 'Jollibee' },
    { date: new Date(2026, 5, 16).getTime(), amount: 5000000, type: 'income', description: 'Salary' },
  ]

  it('adds rows once and reconciles the ending balance', async () => {
    const { a } = await twoAccounts() // opening 10000
    // computed after rows = 10000 - 150000 + 5000000 = 4860000; state ending 5000000
    const res = await commitImport(a, rows, { endingBalance: 5000000 })
    expect(res.added).toBe(2)
    const acct = (await db.accounts.get(a))!
    const txns = await db.transactions.where('accountId').equals(a).toArray()
    expect(accountBalance(acct, txns)).toBe(5000000)
  })

  it('re-importing the same file adds nothing (dedup)', async () => {
    const { a } = await twoAccounts()
    const first = await commitImport(a, rows)
    expect(first.added).toBe(2)
    const second = await commitImport(a, rows)
    expect(second.added).toBe(0)
    expect(second.skipped).toBe(2)
    expect(await db.transactions.where('accountId').equals(a).count()).toBe(2)
  })

  it('undo removes the whole batch incl. the reconcile adjustment', async () => {
    const { a } = await twoAccounts()
    const res = await commitImport(a, rows, { endingBalance: 999999 })
    expect(await db.transactions.where('accountId').equals(a).count()).toBe(3) // 2 rows + adjust
    await undoImport(res.batchId)
    expect(await db.transactions.where('accountId').equals(a).count()).toBe(0)
  })
})

describe('contributeToGoal', () => {
  it('a virtual goal contribution does not change net worth or total income', async () => {
    const { a } = await twoAccounts() // opening 10000
    const goalId = await addGoal({ name: 'Japan trip', targetAmount: 100000 })

    const nwBefore = netWorth(await db.accounts.toArray(), await db.transactions.toArray())
    const incomeBefore = totalIncome(await db.transactions.toArray())

    await contributeToGoal({ goalId, accountId: a, amount: 5000, date: Date.now() })

    const accounts = await db.accounts.toArray()
    const txns = await db.transactions.toArray()
    expect(netWorth(accounts, txns)).toBe(nwBefore)
    expect(totalIncome(txns)).toBe(incomeBefore)
    // …but the contribution IS counted toward the goal.
    const goal = (await db.goals.get(goalId))!
    expect(goalProgress(goal, txns, accounts)).toBe(5000)
    expect(txns.some((t) => t.type === 'goal' && t.goalId === goalId)).toBe(true)
  })

  it('a linked goal contribution moves money via transfer (net worth and income unchanged)', async () => {
    const { a, b } = await twoAccounts() // a opening 10000 (spend), b opening 0 (backing)
    const goalId = await addGoal({ name: 'Emergency fund', targetAmount: 100000, linkedAccountId: b })

    const nwBefore = netWorth(await db.accounts.toArray(), await db.transactions.toArray())

    await contributeToGoal({ goalId, accountId: a, amount: 4000, date: Date.now() })

    const accounts = await db.accounts.toArray()
    const txns = await db.transactions.toArray()
    expect(netWorth(accounts, txns)).toBe(nwBefore) // transfer nets to zero
    expect(totalIncome(txns)).toBe(0) // no fabricated income
    expect(txns.filter((t) => t.type === 'transfer')).toHaveLength(2) // both legs
    // progress = backing-account balance; money came out of the spending account.
    const goal = (await db.goals.get(goalId))!
    expect(goalProgress(goal, txns, accounts)).toBe(4000)
    expect(accountBalance(accounts.find((x) => x.id === a)!, txns)).toBe(6000)
  })
})

describe('backup export / import round-trip', () => {
  it('export -> clear -> import restores everything exactly', async () => {
    await seedIfEmpty()
    const { a } = await twoAccounts()
    await addTransaction({ accountId: a, amount: -1500, type: 'expense', date: Date.now() })
    await addTransfer({ fromAccountId: a, toAccountId: a, amount: 1, date: Date.now() }) // 2 legs

    const before = await exportData()
    const counts = {
      accounts: before.accounts.length,
      transactions: before.transactions.length,
      categories: before.categories.length,
    }

    await clearAllData()
    expect(await db.accounts.count()).toBe(0)
    expect(await db.transactions.count()).toBe(0)

    await importData(JSON.parse(JSON.stringify(before)))
    expect(await db.accounts.count()).toBe(counts.accounts)
    expect(await db.transactions.count()).toBe(counts.transactions)
    expect(await db.categories.count()).toBe(counts.categories)
  })

  it('rejects a non-Pera file', async () => {
    await expect(importData({ app: 'other' })).rejects.toThrow()
  })

  it('a malformed backup (a row missing its id) is rejected WITHOUT wiping existing data', async () => {
    await seedIfEmpty()
    const { a } = await twoAccounts()
    await addTransaction({ accountId: a, amount: -1500, type: 'expense', date: Date.now() })
    const accountsBefore = await db.accounts.count()
    const txnsBefore = await db.transactions.count()
    expect(accountsBefore).toBeGreaterThan(0)
    expect(txnsBefore).toBeGreaterThan(0)

    const malformed = {
      app: 'pera',
      version: 1,
      accounts: [{ name: 'No id here' }], // <- missing id: arrays alone are not enough
      transactions: [],
      categories: [],
      budgets: [],
      goals: [],
      settings: [],
    }
    await expect(importData(malformed)).rejects.toThrow()

    // Restore is the recovery path — a bad file must never empty the live DB.
    expect(await db.accounts.count()).toBe(accountsBefore)
    expect(await db.transactions.count()).toBe(txnsBefore)
  })
})
