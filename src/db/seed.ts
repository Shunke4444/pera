import { now } from './db'
import { query, withTransaction } from './sql'
import { insertRow } from './crud'
import { emitChange } from './changes'
import type { Account, AccountType, Category, Settings } from './types'

const asRow = (o: unknown): Record<string, unknown> => o as Record<string, unknown>

type SeedAccount = Pick<Account, 'id' | 'name' | 'bank' | 'color' | 'isIncomeSource'> & {
  type: AccountType
}

// Brand dots from STYLE.md. Stable ids keep seeds idempotent + referable.
const seedAccounts: Account[] = ([
  { id: 'gcash', name: 'GCash', bank: 'GCash', type: 'ewallet', color: '#3B82F6' },
  { id: 'maya', name: 'Maya', bank: 'Maya', type: 'ewallet', color: '#22C55E' },
  { id: 'maribank', name: 'Maribank', bank: 'Maribank', type: 'savings', color: '#F97316' },
  { id: 'aub', name: 'AUB HelloMoney', bank: 'AUB HelloMoney', type: 'savings', color: '#14B8A6', isIncomeSource: true },
] as SeedAccount[]).map((a, i) => ({
  currency: 'PHP',
  openingBalance: 0,
  archived: false,
  sortOrder: i,
  createdAt: now(),
  updatedAt: now(),
  ...a,
}))

const expenseCats: [string, string][] = [
  ['groceries', 'Groceries'],
  ['food', 'Food'],
  ['transport', 'Transport'],
  ['bills', 'Bills'],
  ['shopping', 'Shopping'],
  ['health', 'Health'],
  ['fun', 'Fun'],
  ['other-expense', 'Other'],
]

const incomeCats: [string, string][] = [
  ['salary', 'Salary'],
  ['freelance', 'Freelance'],
  ['other-income', 'Other'],
]

const seedCategories: Category[] = [
  ...expenseCats.map(([id, name]) => ({ id, name, kind: 'expense' as const, color: '#9AA0AA' })),
  ...incomeCats.map(([id, name]) => ({ id, name, kind: 'income' as const, color: '#34D399' })),
]

const seedSettings: Settings = {
  id: 'singleton',
  baseCurrency: 'PHP',
  theme: 'system',
  // A couple of common one-tap widget presets (account resolves to default/first
  // at publish time). Users edit these in Settings → Quick-add presets.
  quickAddPresets: [
    { id: 'preset-food', label: 'Food ₱100', amount: 10000, type: 'expense', categoryId: 'food' },
    {
      id: 'preset-transport',
      label: 'Jeep ₱13',
      amount: 1300,
      type: 'expense',
      categoryId: 'transport',
    },
  ],
}

async function count(table: string): Promise<number> {
  return Number((await query(`SELECT COUNT(*) n FROM ${table}`))[0]?.n ?? 0)
}

/**
 * First-run seed: insert the 4 accounts, default categories, and the settings
 * singleton — only when the database is empty. Safe to call on every startup.
 */
export async function seedIfEmpty(): Promise<void> {
  let seeded = false
  await withTransaction(async () => {
    if ((await count('accounts')) === 0) {
      for (const a of seedAccounts) await insertRow('accounts', asRow(a))
      seeded = true
    }
    if ((await count('categories')) === 0) {
      for (const c of seedCategories) await insertRow('categories', asRow(c))
      seeded = true
    }
    if ((await count('settings')) === 0) {
      await insertRow('settings', asRow(seedSettings))
      seeded = true
    }
  })
  if (seeded) emitChange()
}
