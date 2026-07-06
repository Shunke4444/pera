// Runtime driver over @capacitor-community/sqlite. Opens a plain (unencrypted)
// SQLite file both the WebView and — from Phase 4 — native Kotlin read/write.
// On web the plugin runs a WASM SQLite behind the <jeep-sqlite> element and
// persists to IndexedDB via saveToStore(); on native it's a real file.

import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { SqlDriver, SqlValue } from './types'
import { DB_NAME, DB_VERSION } from '../schema'

export async function createCapacitorDriver(): Promise<SqlDriver> {
  const isWeb = Capacitor.getPlatform() === 'web'
  const conn = new SQLiteConnection(CapacitorSQLite)

  if (isWeb) {
    // The web store needs the jeep-sqlite custom element defined + mounted
    // before initWebStore() can wire up the WASM-backed IndexedDB persistence.
    const { defineCustomElements } = await import('jeep-sqlite/loader')
    defineCustomElements(window)
    if (!document.querySelector('jeep-sqlite')) {
      document.body.appendChild(document.createElement('jeep-sqlite'))
    }
    await customElements.whenDefined('jeep-sqlite')
    await conn.initWebStore()
  }

  // Reuse a live connection across hot reloads instead of failing to recreate it.
  const exists = (await conn.isConnection(DB_NAME, false)).result
  const db: SQLiteDBConnection = exists
    ? await conn.retrieveConnection(DB_NAME, false)
    : await conn.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false)
  await db.open()

  // Path-parity check (032): log the plugin's on-disk file so it can be compared
  // to the path PeraDb (native widget) opens — they must be the SAME file. On
  // Android both resolve to .../databases/peraSQLite.db.
  if (!isWeb) {
    try {
      const { url } = await db.getUrl()
      console.log(`[Pera] plugin SQLite file: ${url}`)
    } catch {
      /* getUrl unavailable — non-fatal */
    }
  }

  return {
    async execute(sql) {
      await db.execute(sql, false)
    },
    async query<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
      const res = await db.query(sql, params as unknown[])
      return (res.values ?? []) as T[]
    },
    async run(sql, params = []) {
      // transaction=false: don't let the plugin wrap each write in its own
      // BEGIN/COMMIT — our withTransaction() manages atomic groups explicitly.
      await db.run(sql, params as unknown[], false)
    },
    async beginTransaction() {
      await db.beginTransaction()
    },
    async commitTransaction() {
      await db.commitTransaction()
    },
    async rollbackTransaction() {
      await db.rollbackTransaction()
    },
    async persist() {
      if (isWeb) await conn.saveToStore(DB_NAME)
    },
    async close() {
      await conn.closeConnection(DB_NAME, false)
    },
  }
}
