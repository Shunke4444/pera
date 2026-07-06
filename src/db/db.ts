// Database bootstrap. Storage is now shared SQLite (via @capacitor-community/
// sqlite) instead of Dexie/IndexedDB, so the WebView and — from Phase 4 — the
// native widget read/write the SAME file. `initDb()` picks the driver, applies
// the schema + PRAGMAs, and runs the one-time Dexie→SQLite migration. `newId`
// and `now` are unchanged so the rest of the app is untouched.

import { hasDriver, setDriver, execute } from './sql'
import { PRAGMAS, SCHEMA } from './schema'

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

/**
 * Open the shared SQLite database, apply schema + PRAGMAs (WAL, busy_timeout),
 * and run the legacy IndexedDB migration once. Idempotent — safe to await on
 * every launch (CREATE TABLE IF NOT EXISTS; the driver is created only once).
 * The Capacitor driver is imported lazily so tests can inject the sql.js driver
 * via setDriver() and never load the native plugin.
 */
export async function initDb(): Promise<void> {
  if (!hasDriver()) {
    const { createCapacitorDriver } = await import('./driver/capacitor')
    setDriver(await createCapacitorDriver())
  }
  await execute(PRAGMAS)
  await execute(SCHEMA)
  const { migrateFromDexieIfNeeded } = await import('./migrate')
  await migrateFromDexieIfNeeded()
}
