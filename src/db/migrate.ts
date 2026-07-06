// One-time migration: copy a legacy Dexie/IndexedDB "pera" database into SQLite
// on first launch of the SQLite build. Runs inside the WebView (which still has
// IndexedDB access even on native), so an upgrading device keeps all its data.
// Idempotent via a `migrated` flag in the meta table; JSON export/import remains
// the manual safety net.

import Dexie from 'dexie'
import { query, run, withTransaction } from './sql'
import { insertRow } from './crud'
import { emitChange } from './changes'
import { TABLES } from './schema'

async function getMeta(key: string): Promise<string | null> {
  const r = await query<{ value: string }>('SELECT value FROM meta WHERE key=?', [key])
  return r[0] ? String(r[0].value) : null
}

async function setMeta(key: string, value: string): Promise<void> {
  await run('INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)', [key, value])
}

async function isEmpty(): Promise<boolean> {
  const n = Number((await query('SELECT COUNT(*) n FROM accounts'))[0]?.n ?? 0)
  return n === 0
}

/** Migrate legacy Dexie data into SQLite exactly once. Best-effort — a missing
 *  or unreadable legacy DB simply marks the migration done with no rows copied. */
export async function migrateFromDexieIfNeeded(): Promise<void> {
  if (await getMeta('migrated')) return
  // Only import into an EMPTY SQLite (never over live SQLite data).
  if (!(await isEmpty())) {
    await setMeta('migrated', '1')
    return
  }
  try {
    if (typeof indexedDB === 'undefined') {
      await setMeta('migrated', '1')
      return
    }
    const legacy = new Dexie('pera')
    legacy.version(2).stores({
      accounts: 'id',
      transactions: 'id',
      categories: 'id',
      budgets: 'id',
      goals: 'id',
      settings: 'id',
      recurring: 'id',
    })
    await legacy.open()

    const read = async (t: string): Promise<Record<string, unknown>[]> => {
      try {
        return (await legacy.table(t).toArray()) as Record<string, unknown>[]
      } catch {
        return []
      }
    }
    const data: Record<string, Record<string, unknown>[]> = {}
    for (const t of TABLES) data[t] = await read(t)

    const total = TABLES.reduce((n, t) => n + data[t].length, 0)
    if (total > 0) {
      await withTransaction(async () => {
        for (const t of TABLES) {
          for (const row of data[t]) await insertRow(t, row)
        }
      })
      emitChange()
    }
    legacy.close()
  } catch {
    /* no legacy database / already gone — nothing to migrate */
  }
  await setMeta('migrated', '1')
}
