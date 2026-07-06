// Driver holder + the high-level SQL ops the repo calls. One driver is set at
// init (Capacitor at runtime, sql.js in tests). run() auto-persists standalone
// writes; withTransaction() batches a group and persists once on commit.

import type { SqlDriver, SqlValue } from './driver/types'

let driver: SqlDriver | null = null
let inTx = false

export function setDriver(d: SqlDriver): void {
  driver = d
}

export function hasDriver(): boolean {
  return driver !== null
}

function active(): SqlDriver {
  if (!driver) throw new Error('Pera DB not initialized — call initDb() first.')
  return driver
}

export async function execute(sql: string): Promise<void> {
  await active().execute(sql)
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: SqlValue[] = [],
): Promise<T[]> {
  return active().query<T>(sql, params)
}

export async function run(sql: string, params: SqlValue[] = []): Promise<void> {
  const d = active()
  await d.run(sql, params)
  if (!inTx) await d.persist() // durability for one-off writes; batched otherwise
}

/**
 * Run `fn` inside one atomic SQLite transaction: commit on success (then persist
 * once), rollback on throw. Re-entrant calls just join the current transaction
 * (no nested BEGIN, which SQLite forbids).
 */
export async function withTransaction(fn: () => Promise<void>): Promise<void> {
  if (inTx) {
    await fn()
    return
  }
  const d = active()
  inTx = true
  await d.beginTransaction()
  try {
    await fn()
    await d.commitTransaction()
  } catch (e) {
    try {
      await d.rollbackTransaction()
    } catch {
      /* rollback best-effort */
    }
    inTx = false
    throw e
  }
  inTx = false
  await d.persist()
}
