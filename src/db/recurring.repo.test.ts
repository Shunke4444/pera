import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import {
  addAccount,
  addRecurring,
  processDueRecurring,
  postRecurringNow,
  listRecurring,
} from './repo'
import { accountBalance } from '../lib/balances'

function ms(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getTime()
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function account() {
  return addAccount({ name: 'GCash', bank: 'GCash', type: 'ewallet', openingBalance: 0 })
}

describe('processDueRecurring — auto-post', () => {
  it('posts a salary once, updates the balance, and advances the next run', async () => {
    const acc = await account()
    const id = await addRecurring({
      accountId: acc,
      type: 'income',
      amount: 6_000_000, // ₱60,000
      freq: 'monthly',
      interval: 1,
      anchorDay: 15,
      startDate: ms(2026, 1, 1),
      autoPost: true,
    })

    const posted = await processDueRecurring(ms(2026, 1, 20))
    expect(posted).toBe(1)

    const txns = await db.transactions.toArray()
    expect(txns).toHaveLength(1)
    expect(txns[0].amount).toBe(6_000_000)
    expect(txns[0].type).toBe('income')
    expect(txns[0].recurringId).toBe(id)
    expect(txns[0].date).toBe(ms(2026, 1, 15))

    const acct = await db.accounts.get(acc)
    expect(accountBalance(acct!, txns)).toBe(6_000_000)

    const rule = await db.recurring.get(id)
    expect(rule!.nextRunDate).toBe(ms(2026, 2, 15))
    expect(rule!.lastPostedDate).toBe(ms(2026, 1, 15))
  })

  it('never double-posts on reopen (advanced next run)', async () => {
    const acc = await account()
    await addRecurring({
      accountId: acc,
      type: 'income',
      amount: 6_000_000,
      freq: 'monthly',
      interval: 1,
      anchorDay: 15,
      startDate: ms(2026, 1, 1),
      autoPost: true,
    })
    await processDueRecurring(ms(2026, 1, 20))
    const again = await processDueRecurring(ms(2026, 1, 20))
    expect(again).toBe(0)
    expect(await db.transactions.count()).toBe(1)
  })

  it('dedupes on (recurringId + date) even if next run is reset', async () => {
    const acc = await account()
    const id = await addRecurring({
      accountId: acc,
      type: 'income',
      amount: 6_000_000,
      freq: 'monthly',
      interval: 1,
      anchorDay: 15,
      startDate: ms(2026, 1, 1),
      autoPost: true,
    })
    await processDueRecurring(ms(2026, 1, 20))
    // Simulate a crash that posted but didn't advance: rewind nextRunDate.
    await db.recurring.update(id, { nextRunDate: ms(2026, 1, 15) })
    const again = await processDueRecurring(ms(2026, 1, 20))
    expect(again).toBe(0)
    expect(await db.transactions.count()).toBe(1)
  })

  it('catches up every missed occurrence once', async () => {
    const acc = await account()
    await addRecurring({
      accountId: acc,
      type: 'expense',
      amount: 50_000,
      freq: 'monthly',
      interval: 1,
      anchorDay: 15,
      startDate: ms(2026, 1, 1),
      autoPost: true,
    })
    const posted = await processDueRecurring(ms(2026, 4, 20))
    expect(posted).toBe(4) // Jan, Feb, Mar, Apr
    expect(await processDueRecurring(ms(2026, 4, 20))).toBe(0)
  })

  it('posts a day-31 rule on the last day of a short month', async () => {
    const acc = await account()
    await addRecurring({
      accountId: acc,
      type: 'expense',
      amount: 100_000,
      freq: 'monthly',
      interval: 1,
      anchorDay: 31,
      startDate: ms(2026, 2, 1),
      autoPost: true,
    })
    await processDueRecurring(ms(2026, 2, 28))
    const txns = await db.transactions.toArray()
    expect(txns).toHaveLength(1)
    expect(txns[0].date).toBe(ms(2026, 2, 28))
  })
})

describe('manual ("remind me") rules', () => {
  it('does not auto-post and is left to surface as upcoming', async () => {
    const acc = await account()
    const id = await addRecurring({
      accountId: acc,
      type: 'expense',
      amount: 1_200_000, // ₱12,000 rent
      freq: 'monthly',
      interval: 1,
      anchorDay: 1,
      startDate: ms(2026, 1, 1),
      autoPost: false,
    })
    const posted = await processDueRecurring(ms(2026, 2, 10))
    expect(posted).toBe(0)
    expect(await db.transactions.count()).toBe(0)
    // nextRunDate stays at the earliest due date so it shows as overdue/upcoming.
    const rule = await db.recurring.get(id)
    expect(rule!.nextRunDate).toBe(ms(2026, 1, 1))
  })

  it('postRecurringNow posts once and advances', async () => {
    const acc = await account()
    const id = await addRecurring({
      accountId: acc,
      type: 'expense',
      amount: 1_200_000,
      freq: 'monthly',
      interval: 1,
      anchorDay: 1,
      startDate: ms(2026, 1, 1),
      autoPost: false,
    })
    await postRecurringNow(id)
    let txns = await db.transactions.toArray()
    expect(txns).toHaveLength(1)
    expect(txns[0].amount).toBe(-1_200_000)
    expect((await db.recurring.get(id))!.nextRunDate).toBe(ms(2026, 2, 1))

    // A second click posts the NEXT occurrence (one per click).
    await postRecurringNow(id)
    txns = await db.transactions.toArray()
    expect(txns).toHaveLength(2)
    expect((await db.recurring.get(id))!.nextRunDate).toBe(ms(2026, 3, 1))
  })
})

describe('listRecurring', () => {
  it('returns non-archived rules sorted by next run', async () => {
    const acc = await account()
    await addRecurring({
      accountId: acc, type: 'expense', amount: 100, freq: 'monthly', interval: 1,
      anchorDay: 28, startDate: ms(2026, 1, 1), autoPost: true,
    })
    await addRecurring({
      accountId: acc, type: 'expense', amount: 100, freq: 'monthly', interval: 1,
      anchorDay: 5, startDate: ms(2026, 1, 1), autoPost: true,
    })
    const rules = await listRecurring()
    expect(rules).toHaveLength(2)
    expect(rules[0].nextRunDate).toBeLessThan(rules[1].nextRunDate)
  })
})
