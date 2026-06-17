import { db, now } from './db'
import type { Account, AccountType, Category, Settings } from './types'

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
}

/**
 * First-run seed: insert the 4 accounts, default categories, and the settings
 * singleton — only when the database is empty. Safe to call on every startup.
 */
export async function seedIfEmpty(): Promise<void> {
  await db.transaction('rw', db.accounts, db.categories, db.settings, async () => {
    if ((await db.accounts.count()) === 0) {
      await db.accounts.bulkAdd(seedAccounts)
    }
    if ((await db.categories.count()) === 0) {
      await db.categories.bulkAdd(seedCategories)
    }
    if (!(await db.settings.get('singleton'))) {
      await db.settings.add(seedSettings)
    }
  })
}
