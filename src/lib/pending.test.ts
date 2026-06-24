import { describe, it, expect } from 'vitest'
import { parsePendingQueue, planDrain, type PendingTxn } from './pending'

const p = (id: string, over: Partial<PendingTxn> = {}): PendingTxn => ({
  id,
  accountId: 'gcash',
  amount: -10000,
  type: 'expense',
  date: 1_700_000_000_000,
  ...over,
})

describe('parsePendingQueue', () => {
  it('returns [] for null / empty / garbage', () => {
    expect(parsePendingQueue(null)).toEqual([])
    expect(parsePendingQueue('')).toEqual([])
    expect(parsePendingQueue('not json')).toEqual([])
    expect(parsePendingQueue('{}')).toEqual([]) // object, not array
  })

  it('parses a well-formed array', () => {
    const raw = JSON.stringify([p('a'), p('b', { type: 'income', amount: 5000 })])
    const out = parsePendingQueue(raw)
    expect(out.map((x) => x.id)).toEqual(['a', 'b'])
    expect(out[1]).toMatchObject({ type: 'income', amount: 5000 })
  })

  it('drops records missing required fields', () => {
    const raw = JSON.stringify([
      p('ok'),
      { id: 'no-account', amount: -100, type: 'expense', date: 1 }, // no accountId
      { accountId: 'x', amount: -100, type: 'expense', date: 1 }, // no id
      { id: 'bad-amount', accountId: 'x', amount: 'NaN', type: 'expense', date: 1 },
    ])
    expect(parsePendingQueue(raw).map((x) => x.id)).toEqual(['ok'])
  })
})

describe('planDrain — idempotent by pending id', () => {
  it('empty queue → empty plan', () => {
    expect(planDrain([], new Set())).toEqual({ toAdd: [], skipped: [] })
  })

  it('all-new pendings → all added, order preserved', () => {
    const plan = planDrain([p('a'), p('b'), p('c')], new Set())
    expect(plan.toAdd.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(plan.skipped).toEqual([])
  })

  it('skips a pending whose id was already imported (re-drain is safe)', () => {
    const plan = planDrain([p('a'), p('b')], new Set(['a']))
    expect(plan.toAdd.map((x) => x.id)).toEqual(['b'])
    expect(plan.skipped).toEqual(['a'])
  })

  it('dedupes ids repeated within the same batch (keeps the first)', () => {
    const plan = planDrain([p('a'), p('a'), p('b')], new Set())
    expect(plan.toAdd.map((x) => x.id)).toEqual(['a', 'b'])
    expect(plan.skipped).toEqual(['a'])
  })

  it('draining the same queue twice imports nothing the second time', () => {
    const queue = [p('a'), p('b')]
    const first = planDrain(queue, new Set())
    const importedIds = new Set(first.toAdd.map((x) => x.id))
    const second = planDrain(queue, importedIds)
    expect(second.toAdd).toEqual([])
    expect(second.skipped).toEqual(['a', 'b'])
  })
})
