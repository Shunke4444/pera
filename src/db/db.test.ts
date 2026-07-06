import { describe, it, expect, beforeEach } from 'vitest'
import { resetTestDb } from './testDb'
import { now } from './db'
import { seedIfEmpty } from './seed'
import {
  addAccount,
  addTransaction,
  getTransaction,
  updateTransaction,
  deleteTransaction,
  getAccounts,
  getAccount,
  getCategories,
  getSettings,
} from './repo'
import { subscribeChange } from './changes'

beforeEach(async () => {
  await resetTestDb()
})

describe('seedIfEmpty', () => {
  it('seeds the 4 accounts, default categories and settings singleton', async () => {
    await seedIfEmpty()
    expect((await getAccounts()).length).toBe(4)
    expect((await getAccount('aub'))?.isIncomeSource).toBe(true)
    expect((await getCategories()).length).toBe(11)
    expect((await getSettings())?.baseCurrency).toBe('PHP')
  })

  it('is idempotent — calling twice does not duplicate', async () => {
    await seedIfEmpty()
    await seedIfEmpty()
    expect((await getAccounts()).length).toBe(4)
    expect((await getCategories()).length).toBe(11)
  })
})

describe('CRUD on transactions', () => {
  it('creates, reads, updates and deletes a record', async () => {
    const id = await addTransaction({
      accountId: 'gcash',
      amount: -1500,
      type: 'expense',
      categoryId: 'food',
      date: now(),
    })
    expect((await getTransaction(id))?.amount).toBe(-1500)

    await updateTransaction(id, { amount: -2000 })
    expect((await getTransaction(id))?.amount).toBe(-2000)

    await deleteTransaction(id)
    expect(await getTransaction(id)).toBeUndefined()
  })
})

describe('change-bus reactivity', () => {
  it('fires a change signal after a write so subscribers re-run', async () => {
    await seedIfEmpty()
    let hits = 0
    const unsub = subscribeChange(() => {
      hits++
    })
    await addAccount({ name: 'Cash', bank: 'Cash', type: 'cash' })
    expect(hits).toBeGreaterThanOrEqual(1)
    unsub()
  })
})
