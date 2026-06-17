import Dexie, { type Table } from 'dexie'
import type {
  Account,
  Transaction,
  Category,
  Budget,
  Goal,
  Settings,
} from './types'

export type {
  Account,
  Transaction,
  Category,
  Budget,
  Goal,
  Settings,
} from './types'

/** Stable id for new records. */
export function newId(): string {
  return crypto.randomUUID()
}

/** Epoch ms now — single chokepoint so createdAt/updatedAt stay consistent. */
export function now(): number {
  return Date.now()
}

export class PeraDB extends Dexie {
  accounts!: Table<Account, string>
  transactions!: Table<Transaction, string>
  categories!: Table<Category, string>
  budgets!: Table<Budget, string>
  goals!: Table<Goal, string>
  settings!: Table<Settings, string>

  constructor() {
    super('pera')
    // Only indexed fields are listed; `id` is the primary key (first).
    // IndexedDB keys can't be booleans, so `archived` is filtered in JS, not
    // indexed. Only number/string/Date/Array fields are listed here.
    this.version(1).stores({
      accounts: 'id, bank, sortOrder',
      transactions:
        'id, accountId, date, categoryId, type, goalId, transferGroupId, importBatchId, importHash, [accountId+date]',
      categories: 'id, kind',
      budgets: 'id, categoryId',
      goals: 'id, linkedAccountId',
      settings: 'id',
    })
  }
}

export const db = new PeraDB()

// Re-export Dexie's reactive primitive so screens/hooks have one import source.
export { liveQuery } from 'dexie'
