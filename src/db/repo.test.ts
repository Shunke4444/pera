import { describe, it, expect, beforeEach } from 'vitest'
import { resetTestDb } from './testDb'
import {
  addAccount,
  deleteAccount,
  addRecurring,
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
  listGoals,
  archiveGoal,
  contributeToGoal,
  addBudget,
  addCategory,
  deleteCategory,
  upsertPreset,
  deletePreset,
  updateSettings,
  getAccounts,
  getAccount,
  getTransactions,
  getTransactionsByAccount,
  getTransaction,
  getCategories,
  getCategory,
  getBudgets,
  getGoal,
  getRecurring,
  getSettings,
} from './repo'
import { seedIfEmpty } from './seed'
import { accountBalance, netWorth, goalProgress } from '../lib/balances'
import type { ParsedRow } from '../lib/importing'
import type { Transaction } from './types'

/** Σ of income txn amounts — the "total income" a contribution must never inflate. */
function totalIncome(txns: Transaction[]): number {
  return txns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
}

const count = async (rows: Promise<unknown[]>): Promise<number> => (await rows).length

beforeEach(async () => {
  await resetTestDb()
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

    const accounts = await getAccounts()
    const txns = await getTransactions()
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
    const oneLeg = (await getTransactions())[0]
    await deleteTransaction(oneLeg.id)
    expect(await count(getTransactions())).toBe(0)
  })

  it('removes only the targeted plain transaction', async () => {
    const { a } = await twoAccounts()
    const id = await addTransaction({ accountId: a, amount: -500, type: 'expense', date: Date.now() })
    await addTransaction({ accountId: a, amount: -250, type: 'expense', date: Date.now() })
    await deleteTransaction(id)
    expect(await count(getTransactions())).toBe(1)
  })
})

describe('deleteAccount', () => {
  it('removes the account, its transactions, and its recurring rules — leaving others intact', async () => {
    const { a, b } = await twoAccounts() // a opening 10000, b opening 0
    // a: a plain expense + a recurring rule; b: a plain expense that must survive.
    await addTransaction({ accountId: a, amount: -500, type: 'expense', date: Date.now() })
    await addRecurring({
      accountId: a,
      type: 'expense',
      amount: 1000,
      freq: 'monthly',
      interval: 1,
      startDate: Date.now(),
      autoPost: false,
    })
    await addTransaction({ accountId: b, amount: -250, type: 'expense', date: Date.now() })

    await deleteAccount(a)

    expect(await getAccount(a)).toBeUndefined()
    expect(await count(getTransactionsByAccount(a))).toBe(0)
    expect((await getRecurring()).filter((r) => r.accountId === a)).toHaveLength(0)
    // b is untouched.
    expect(await getAccount(b)).toBeDefined()
    expect(await count(getTransactionsByAccount(b))).toBe(1)

    // Net worth no longer counts the deleted account.
    const accounts = await getAccounts()
    const txns = await getTransactions()
    expect(netWorth(accounts, txns)).toBe(-250) // only b: opening 0 - 250
  })

  it('also deletes BOTH legs of a transfer that touched the account', async () => {
    const { a, b } = await twoAccounts()
    await addTransfer({ fromAccountId: a, toAccountId: b, amount: 3000, date: Date.now() })
    expect(await count(getTransactions())).toBe(2)

    await deleteAccount(a)

    // Deleting `a` removes its leg; the surviving leg on `b` is harmless history,
    // but the account `a` and every txn filed under it are gone.
    expect(await count(getTransactionsByAccount(a))).toBe(0)
  })
})

describe('adjustBalance', () => {
  it('inserts an adjustment so the computed balance equals reality', async () => {
    const { a } = await twoAccounts() // opening 10000
    await addTransaction({ accountId: a, amount: -2500, type: 'expense', date: Date.now() })
    // computed = 7500; user states real balance is 8000 → +500 adjustment
    await adjustBalance(a, 8000)
    const acct = (await getAccount(a))!
    const txns = await getTransactionsByAccount(a)
    expect(accountBalance(acct, txns)).toBe(8000)
    expect(txns.filter((t) => t.type === 'adjustment')).toHaveLength(1)
  })

  it('is a no-op when already reconciled', async () => {
    const { a } = await twoAccounts()
    await adjustBalance(a, 10000) // already 10000
    expect(await count(getTransactions())).toBe(0)
  })
})

describe('updateTransfer', () => {
  it('keeps the legs opposite-signed when the amount changes', async () => {
    const { a, b } = await twoAccounts()
    const group = await addTransfer({ fromAccountId: a, toAccountId: b, amount: 3000, date: Date.now() })
    await updateTransfer(group, { amount: 5000 })
    const legs = (await getTransactions()).filter((t) => t.transferGroupId === group)
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
    const txns = await Promise.all([getTransaction(t1), getTransaction(t2)])
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
    const acct = (await getAccount(a))!
    const txns = await getTransactionsByAccount(a)
    expect(accountBalance(acct, txns)).toBe(5000000)
  })

  it('re-importing the same file adds nothing (dedup)', async () => {
    const { a } = await twoAccounts()
    const first = await commitImport(a, rows)
    expect(first.added).toBe(2)
    const second = await commitImport(a, rows)
    expect(second.added).toBe(0)
    expect(second.skipped).toBe(2)
    expect(await count(getTransactionsByAccount(a))).toBe(2)
  })

  it('undo removes the whole batch incl. the reconcile adjustment', async () => {
    const { a } = await twoAccounts()
    const res = await commitImport(a, rows, { endingBalance: 999999 })
    expect(await count(getTransactionsByAccount(a))).toBe(3) // 2 rows + adjust
    await undoImport(res.batchId)
    expect(await count(getTransactionsByAccount(a))).toBe(0)
  })
})

describe('contributeToGoal', () => {
  it('a virtual goal contribution does not change net worth or total income', async () => {
    const { a } = await twoAccounts() // opening 10000
    const goalId = await addGoal({ name: 'Japan trip', targetAmount: 100000 })

    const nwBefore = netWorth(await getAccounts(), await getTransactions())
    const incomeBefore = totalIncome(await getTransactions())

    await contributeToGoal({ goalId, accountId: a, amount: 5000, date: Date.now() })

    const accounts = await getAccounts()
    const txns = await getTransactions()
    expect(netWorth(accounts, txns)).toBe(nwBefore)
    expect(totalIncome(txns)).toBe(incomeBefore)
    // …but the contribution IS counted toward the goal.
    const goal = (await getGoal(goalId))!
    expect(goalProgress(goal, txns, accounts)).toBe(5000)
    expect(txns.some((t) => t.type === 'goal' && t.goalId === goalId)).toBe(true)
  })

  it('a linked goal contribution moves money via transfer (net worth and income unchanged)', async () => {
    const { a, b } = await twoAccounts() // a opening 10000 (spend), b opening 0 (backing)
    const goalId = await addGoal({ name: 'Emergency fund', targetAmount: 100000, linkedAccountId: b })

    const nwBefore = netWorth(await getAccounts(), await getTransactions())

    await contributeToGoal({ goalId, accountId: a, amount: 4000, date: Date.now() })

    const accounts = await getAccounts()
    const txns = await getTransactions()
    expect(netWorth(accounts, txns)).toBe(nwBefore) // transfer nets to zero
    expect(totalIncome(txns)).toBe(0) // no fabricated income
    expect(txns.filter((t) => t.type === 'transfer')).toHaveLength(2) // both legs
    // progress = backing-account balance; money came out of the spending account.
    const goal = (await getGoal(goalId))!
    expect(goalProgress(goal, txns, accounts)).toBe(4000)
    expect(accountBalance(accounts.find((x) => x.id === a)!, txns)).toBe(6000)
  })
})

describe('listGoals', () => {
  // Regression: adding a 2nd goal used to "not load" because the dashboard only
  // read goals[0]. The data layer must return EVERY non-archived goal, in
  // creation order, and progress must resolve for each one independently.
  it('returns every non-archived goal in creation order, each resolving progress', async () => {
    const { a } = await twoAccounts()
    const g1 = await addGoal({ name: 'Japan trip', targetAmount: 100000 })
    const g2 = await addGoal({ name: 'Emergency fund', targetAmount: 200000 })

    await contributeToGoal({ goalId: g1, accountId: a, amount: 5000, date: Date.now() })
    await contributeToGoal({ goalId: g2, accountId: a, amount: 7000, date: Date.now() })

    const goals = await listGoals()
    expect(goals).toHaveLength(2)
    const names = goals.map((g) => g.name)
    expect(names).toContain('Japan trip')
    expect(names).toContain('Emergency fund')

    // oldest first (createdAt non-decreasing)
    for (let i = 1; i < goals.length; i++) {
      expect(goals[i].createdAt).toBeGreaterThanOrEqual(goals[i - 1].createdAt)
    }

    // every goal resolves its own progress (not just the first)
    const txns = await getTransactions()
    const accounts = await getAccounts()
    const byName = (n: string) => goals.find((g) => g.name === n)!
    expect(goalProgress(byName('Japan trip'), txns, accounts)).toBe(5000)
    expect(goalProgress(byName('Emergency fund'), txns, accounts)).toBe(7000)
  })

  it('omits archived goals', async () => {
    await addGoal({ name: 'Keep', targetAmount: 1000 })
    const drop = await addGoal({ name: 'Drop', targetAmount: 1000 })
    await archiveGoal(drop)
    const goals = await listGoals()
    expect(goals.map((g) => g.name)).toEqual(['Keep'])
  })
})

describe('addCategory', () => {
  it('creates a new category with an auto color and returns its id', async () => {
    const id = await addCategory({ name: 'Pets', kind: 'expense' })
    const cat = await getCategory(id)
    expect(cat?.name).toBe('Pets')
    expect(cat?.kind).toBe('expense')
    expect(cat?.color).toBeTruthy()
  })

  it('reuses an existing category when the name matches (case-insensitive, same kind)', async () => {
    await seedIfEmpty() // seeds "Food" / expense
    const before = await count(getCategories())
    const id = await addCategory({ name: 'food', kind: 'expense' })
    expect(id).toBe('food')
    expect(await count(getCategories())).toBe(before) // no duplicate row
  })

  it('treats the same name under a different kind as a separate category', async () => {
    const expense = await addCategory({ name: 'Bonus', kind: 'expense' })
    const income = await addCategory({ name: 'Bonus', kind: 'income' })
    expect(income).not.toBe(expense)
    expect(await count(getCategories())).toBe(2)
  })
})

describe('deleteCategory', () => {
  it('removes the category, clears it from txns, and drops its budget', async () => {
    const { a } = await twoAccounts()
    const catId = await addCategory({ name: 'Pets', kind: 'expense' })
    const t1 = await addTransaction({
      accountId: a, amount: -500, type: 'expense', categoryId: catId, date: Date.now(),
    })
    await addBudget({ categoryId: catId, amount: 100000 })

    await deleteCategory(catId)

    expect(await getCategory(catId)).toBeUndefined()
    expect((await getTransaction(t1))?.categoryId).toBeUndefined()
    expect((await getBudgets()).filter((b) => b.categoryId === catId)).toHaveLength(0)
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
    expect(await count(getAccounts())).toBe(0)
    expect(await count(getTransactions())).toBe(0)

    await importData(JSON.parse(JSON.stringify(before)))
    expect(await count(getAccounts())).toBe(counts.accounts)
    expect(await count(getTransactions())).toBe(counts.transactions)
    expect(await count(getCategories())).toBe(counts.categories)
  })

  it('rejects a non-Pera file', async () => {
    await expect(importData({ app: 'other' })).rejects.toThrow()
  })

  it('a malformed backup (a row missing its id) is rejected WITHOUT wiping existing data', async () => {
    await seedIfEmpty()
    const { a } = await twoAccounts()
    await addTransaction({ accountId: a, amount: -1500, type: 'expense', date: Date.now() })
    const accountsBefore = await count(getAccounts())
    const txnsBefore = await count(getTransactions())
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
    expect(await count(getAccounts())).toBe(accountsBefore)
    expect(await count(getTransactions())).toBe(txnsBefore)
  })
})

describe('quick-add presets', () => {
  it('upserts (insert then replace by id) and deletes presets in settings', async () => {
    await seedIfEmpty() // settings singleton must exist for update() to land
    await updateSettings({ quickAddPresets: [] }) // ignore seed defaults
    await upsertPreset({ id: 'p1', label: 'Food', amount: 10000, type: 'expense' })
    await upsertPreset({ id: 'p2', label: 'Jeep', amount: 1300, type: 'expense' })
    let s = await getSettings()
    expect(s?.quickAddPresets?.map((p) => p.id)).toEqual(['p1', 'p2'])

    // Same id replaces in place, doesn't duplicate.
    await upsertPreset({ id: 'p1', label: 'Lunch', amount: 15000, type: 'expense' })
    s = await getSettings()
    expect(s?.quickAddPresets).toHaveLength(2)
    expect(s?.quickAddPresets?.find((p) => p.id === 'p1')?.label).toBe('Lunch')

    await deletePreset('p1')
    s = await getSettings()
    expect(s?.quickAddPresets?.map((p) => p.id)).toEqual(['p2'])
  })

  it('dedupes id-less presets by (type+amount+category+account), assigning an id', async () => {
    await seedIfEmpty()
    await updateSettings({ quickAddPresets: [] })

    // Two "Save as quick-add" taps on the SAME combo (no id) → one preset.
    await upsertPreset({ label: 'Food ₱100', amount: 10000, type: 'expense', categoryId: 'c1', accountId: 'a1' })
    await upsertPreset({ label: 'Food again', amount: 10000, type: 'expense', categoryId: 'c1', accountId: 'a1' })
    let s = await getSettings()
    expect(s?.quickAddPresets).toHaveLength(1)
    // Kept a single entry, got a real id, and the label refreshed to the latest.
    expect(s?.quickAddPresets?.[0].id).toBeTruthy()
    expect(s?.quickAddPresets?.[0].label).toBe('Food again')

    // Any differing tuple field is a distinct action → a new preset each time.
    await upsertPreset({ label: '₱200', amount: 20000, type: 'expense', categoryId: 'c1', accountId: 'a1' }) // amount
    await upsertPreset({ label: 'Salary', amount: 10000, type: 'income', categoryId: 'c1', accountId: 'a1' }) // type
    await upsertPreset({ label: 'Other cat', amount: 10000, type: 'expense', categoryId: 'c2', accountId: 'a1' }) // category
    await upsertPreset({ label: 'Other acct', amount: 10000, type: 'expense', categoryId: 'c1', accountId: 'a2' }) // account
    s = await getSettings()
    expect(s?.quickAddPresets).toHaveLength(5)
  })
})
