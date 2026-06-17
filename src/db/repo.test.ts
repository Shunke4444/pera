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
} from './repo'
import { accountBalance, netWorth } from '../lib/balances'

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
