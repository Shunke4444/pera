import Dexie, { type Table } from 'dexie'
import type {
  Account,
  Transaction,
  Category,
  Budget,
  Goal,
  Settings,
  RecurringRule,
} from './types'

export type {
  Account,
  Transaction,
  Category,
  Budget,
  Goal,
  Settings,
  RecurringRule,
} from './types'

/**
 * Stable id for new records. `crypto.randomUUID` only exists in secure contexts,
 * so opening the PWA over plain http (e.g. http://192.168.x.x) would otherwise
 * throw on every write. `getRandomValues` IS available there, so fall back to a
 * hand-built v4 UUID (and to Math.random as a last resort).
 */
export function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const b = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40 // version 4
  b[8] = (b[8] & 0x3f) | 0x80 // variant 10
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'))
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`
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
  recurring!: Table<RecurringRule, string>

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
    // v2 (additive): recurring rules. Dexie upgrades existing v1 data in place;
    // the v1 block above is left untouched. `recurringId` on Transaction is not
    // indexed (dedupe scans by accountId), so transactions keeps its v1 schema.
    this.version(2).stores({
      recurring: 'id, accountId, nextRunDate',
    })
  }
}

export const db = new PeraDB()

// Re-export Dexie's reactive primitive so screens/hooks have one import source.
export { liveQuery } from 'dexie'
