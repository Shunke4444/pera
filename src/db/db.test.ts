import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db, liveQuery, newId, now } from './db'
import type { Account, Transaction } from './types'
import { seedIfEmpty } from './seed'

function makeAccount(id: string): Account {
  return {
    id,
    name: id,
    bank: id,
    type: 'cash',
    currency: 'PHP',
    openingBalance: 0,
    archived: false,
    sortOrder: 99,
    createdAt: now(),
    updatedAt: now(),
  }
}

function makeTxn(): Transaction {
  return {
    id: newId(),
    accountId: 'gcash',
    amount: -1500,
    type: 'expense',
    categoryId: 'food',
    date: now(),
    createdAt: now(),
    updatedAt: now(),
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('seedIfEmpty', () => {
  it('seeds the 4 accounts, default categories and settings singleton', async () => {
    await seedIfEmpty()
    expect(await db.accounts.count()).toBe(4)
    expect((await db.accounts.get('aub'))?.isIncomeSource).toBe(true)
    expect(await db.categories.count()).toBe(11)
    expect((await db.settings.get('singleton'))?.baseCurrency).toBe('PHP')
  })

  it('is idempotent — calling twice does not duplicate', async () => {
    await seedIfEmpty()
    await seedIfEmpty()
    expect(await db.accounts.count()).toBe(4)
    expect(await db.categories.count()).toBe(11)
  })
})

describe('CRUD on transactions', () => {
  it('creates, reads, updates and deletes a record', async () => {
    const t = makeTxn()
    await db.transactions.add(t)
    expect((await db.transactions.get(t.id))?.amount).toBe(-1500)

    await db.transactions.update(t.id, { amount: -2000 })
    expect((await db.transactions.get(t.id))?.amount).toBe(-2000)

    await db.transactions.delete(t.id)
    expect(await db.transactions.get(t.id)).toBeUndefined()
  })
})

describe('liveQuery reactivity', () => {
  it('re-emits when the underlying table changes', async () => {
    await seedIfEmpty()
    const seen: number[] = []
    let resolveFirst: () => void
    let resolveSecond: () => void
    const first = new Promise<void>((r) => {
      resolveFirst = r
    })
    const second = new Promise<void>((r) => {
      resolveSecond = r
    })

    const sub = liveQuery(() => db.accounts.count()).subscribe((count) => {
      seen.push(count)
      if (seen.length === 1) resolveFirst()
      if (seen.length === 2) resolveSecond()
    })

    await first // initial query has run (count === 4) before we mutate
    await db.accounts.add(makeAccount('cash'))
    await second // mutation triggers a re-emission (count === 5)
    sub.unsubscribe()

    expect(seen[0]).toBe(4)
    expect(seen[seen.length - 1]).toBe(5)
  })
})
