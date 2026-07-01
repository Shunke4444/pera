import { describe, it, expect } from 'vitest'
import { buildSnapshotData } from './snapshot'
import type { Account, Category, Goal, Settings, Transaction } from '../db/types'

const ACCT = (over: Partial<Account> = {}): Account => ({
  id: 'gcash',
  name: 'GCash',
  bank: 'GCash',
  type: 'ewallet',
  currency: 'PHP',
  openingBalance: 0,
  archived: false,
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0,
  ...over,
})

const TXN = (over: Partial<Transaction> = {}): Transaction => ({
  id: Math.random().toString(36).slice(2),
  accountId: 'gcash',
  amount: 0,
  type: 'expense',
  date: 0,
  createdAt: 0,
  updatedAt: 0,
  ...over,
})

const CAT = (id: string, name: string, color = '#fff'): Category => ({
  id,
  name,
  kind: 'expense',
  color,
})

// June 15 2026, local — anchored so days-left / projection are deterministic.
const NOW = new Date(2026, 5, 15, 12, 0, 0).getTime()
const onDay = (day: number) => new Date(2026, 5, day, 9, 0, 0).getTime()

describe('buildSnapshotData — v2 shape', () => {
  it('reports net worth, assets and liabilities split', () => {
    const accounts = [
      ACCT({ id: 'a', openingBalance: 100_00 }),
      ACCT({ id: 'b', type: 'credit', openingBalance: -30_00 }),
    ]
    const snap = buildSnapshotData({
      accounts,
      txns: [],
      categories: [],
      budgets: [],
      goals: [],
      settings: undefined,
      nowMs: NOW,
    })
    expect(snap.netWorth).toBe(70_00)
    expect(snap.assets).toBe(100_00)
    expect(snap.liabilities).toBe(-30_00)
    expect(snap.currency).toBe('PHP')
    expect(snap.updatedAt).toBe(NOW)
  })

  it('builds budget detail with level, remaining, days left, projection and top categories', () => {
    const categories = [CAT('food', 'Food', '#f00'), CAT('transport', 'Transport', '#0f0')]
    const txns = [
      TXN({ amount: -200_00, categoryId: 'food', date: onDay(5) }),
      TXN({ amount: -100_00, categoryId: 'transport', date: onDay(10) }),
    ]
    const settings: Settings = {
      id: 'singleton',
      baseCurrency: 'PHP',
      theme: 'system',
      monthlyBudget: 1000_00,
    }
    const snap = buildSnapshotData({
      accounts: [ACCT()],
      txns,
      categories,
      budgets: [],
      goals: [],
      settings,
      nowMs: NOW,
    })
    expect(snap.budget).not.toBeNull()
    const b = snap.budget!
    expect(b.spent).toBe(300_00)
    expect(b.cap).toBe(1000_00)
    expect(b.remaining).toBe(700_00)
    expect(b.level).toBe('ok')
    expect(b.daysLeft).toBe(15) // 30-day June, day 15
    // spent 300 over 15 days → projected ~600
    expect(b.projected).toBe(600_00)
    expect(b.topCategories.map((c) => c.name)).toEqual(['Food', 'Transport'])
    expect(b.topCategories[0]).toMatchObject({ name: 'Food', color: '#f00', spent: 200_00 })
  })

  it('caps top categories to at most three', () => {
    const categories = ['a', 'b', 'c', 'd'].map((k, i) => CAT(k, k.toUpperCase(), `#00${i}`))
    const txns = categories.map((c, i) =>
      TXN({ amount: -(i + 1) * 10_00, categoryId: c.id, date: onDay(2) }),
    )
    const settings: Settings = { id: 'singleton', baseCurrency: 'PHP', theme: 'system', monthlyBudget: 500_00 }
    const snap = buildSnapshotData({
      accounts: [ACCT()],
      txns,
      categories,
      budgets: [],
      goals: [],
      settings,
      nowMs: NOW,
    })
    expect(snap.budget!.topCategories).toHaveLength(3)
    // biggest first: D(40), C(30), B(20)
    expect(snap.budget!.topCategories.map((c) => c.name)).toEqual(['D', 'C', 'B'])
  })

  it('budget is null when no monthly cap is set', () => {
    const snap = buildSnapshotData({
      accounts: [ACCT()],
      txns: [],
      categories: [],
      budgets: [],
      goals: [],
      settings: { id: 'singleton', baseCurrency: 'PHP', theme: 'system' },
      nowMs: NOW,
    })
    expect(snap.budget).toBeNull()
  })

  it('lists goals with pct, saved and target (capped)', () => {
    const goals: Goal[] = [
      { id: 'g1', name: 'Fund', targetAmount: 1000_00, archived: false, createdAt: 1, updatedAt: 1 },
    ]
    const txns = [TXN({ type: 'goal', amount: 250_00, goalId: 'g1', date: onDay(3) })]
    const snap = buildSnapshotData({
      accounts: [ACCT()],
      txns,
      categories: [],
      budgets: [],
      goals,
      settings: undefined,
      nowMs: NOW,
    })
    expect(snap.goals).toHaveLength(1)
    expect(snap.goals[0]).toMatchObject({ name: 'Fund', saved: 250_00, target: 1000_00, pct: 25 })
  })

  it('lists the most recent transactions newest-first, signed, excluding goal earmarks', () => {
    const txns = [
      TXN({ amount: -50_00, date: onDay(1), note: 'Coffee' }),
      TXN({ amount: 500_00, type: 'income', date: onDay(9), note: 'Pay' }),
      TXN({ type: 'goal', amount: 100_00, goalId: 'g1', date: onDay(10) }), // excluded
    ]
    const snap = buildSnapshotData({
      accounts: [ACCT()],
      txns,
      categories: [],
      budgets: [],
      goals: [],
      settings: undefined,
      nowMs: NOW,
    })
    expect(snap.recent.map((r) => r.label)).toEqual(['Pay', 'Coffee'])
    expect(snap.recent[0]).toMatchObject({ signedAmount: 500_00, type: 'income' })
  })

  it('publishes presets with accountId resolved (preset → default → first account)', () => {
    const settings: Settings = {
      id: 'singleton',
      baseCurrency: 'PHP',
      theme: 'system',
      defaultAccountId: 'maya',
      quickAddPresets: [
        { id: 'pr1', label: 'Food', amount: 100_00, type: 'expense', categoryId: 'food' },
        { id: 'pr2', label: 'Jeep', amount: 13_00, type: 'expense', accountId: 'gcash' },
      ],
    }
    const snap = buildSnapshotData({
      accounts: [ACCT({ id: 'gcash' }), ACCT({ id: 'maya', name: 'Maya' })],
      txns: [],
      categories: [],
      budgets: [],
      goals: [],
      settings,
      nowMs: NOW,
    })
    expect(snap.presets).toHaveLength(2)
    expect(snap.presets[0]).toMatchObject({ id: 'pr1', label: 'Food', accountId: 'maya' }) // default
    expect(snap.presets[1]).toMatchObject({ id: 'pr2', accountId: 'gcash' }) // explicit
  })

  it('publishes account + category lists and the default account for the native dialog', () => {
    const settings: Settings = {
      id: 'singleton',
      baseCurrency: 'PHP',
      theme: 'system',
      defaultAccountId: 'maya',
    }
    const snap = buildSnapshotData({
      accounts: [
        ACCT({ id: 'gcash', name: 'GCash', color: '#3B82F6' }),
        ACCT({ id: 'maya', name: 'Maya', color: '#22C55E' }),
        ACCT({ id: 'old', name: 'Old', archived: true }), // excluded — archived
      ],
      txns: [],
      categories: [
        CAT('food', 'Food', '#f00'),
        { id: 'pay', name: 'Salary', kind: 'income', color: '#0f0' },
      ],
      budgets: [],
      goals: [],
      settings,
      nowMs: NOW,
    })
    // Only visible accounts, id + name + color.
    expect(snap.accounts.map((a) => a.id)).toEqual(['gcash', 'maya'])
    expect(snap.accounts[0]).toMatchObject({ id: 'gcash', name: 'GCash', color: '#3B82F6' })
    // Both kinds of category flow through with their kind.
    expect(snap.categories).toHaveLength(2)
    expect(snap.categories.find((c) => c.id === 'pay')).toMatchObject({ kind: 'income', name: 'Salary' })
    expect(snap.defaultAccountId).toBe('maya')
  })

  it('defaults the dialog account to the first visible account when none is set', () => {
    const snap = buildSnapshotData({
      accounts: [ACCT({ id: 'first' }), ACCT({ id: 'second' })],
      txns: [],
      categories: [],
      budgets: [],
      goals: [],
      settings: { id: 'singleton', baseCurrency: 'PHP', theme: 'system' },
      nowMs: NOW,
    })
    expect(snap.defaultAccountId).toBe('first')
  })
})
