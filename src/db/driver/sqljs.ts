// Test driver: sql.js (SQLite compiled to WASM) held in-memory. Pure JS/WASM —
// no native build, no IndexedDB — so the repo tests run in vitest's node env
// against a REAL SQLite engine (same SQL the app runs). Imported only by tests
// (testDb.ts), never by the app bundle, so the node-only fs/module imports here
// never reach the browser build.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import initSqlJs, { type Database } from 'sql.js'
import type { SqlDriver, SqlValue } from './types'

function loadWasm(): ArrayBuffer {
  const require = createRequire(import.meta.url)
  // Resolve the package main (dist/sql-wasm.js) — the './package.json' subpath is
  // blocked by sql.js's exports map — then read the wasm sitting beside it.
  const main = require.resolve('sql.js')
  const buf = readFileSync(join(dirname(main), 'sql-wasm.wasm'))
  // Buffer → a standalone ArrayBuffer (initSqlJs's wasmBinary type wants one).
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

export async function createSqlJsDriver(): Promise<SqlDriver> {
  const SQL = await initSqlJs({ wasmBinary: loadWasm() })
  const db: Database = new SQL.Database()

  return {
    async execute(sql) {
      db.exec(sql)
    },
    async query<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
      const stmt = db.prepare(sql)
      try {
        stmt.bind(params)
        const rows: T[] = []
        while (stmt.step()) rows.push(stmt.getAsObject() as T)
        return rows
      } finally {
        stmt.free()
      }
    },
    async run(sql, params = []) {
      db.run(sql, params)
    },
    async beginTransaction() {
      db.run('BEGIN;')
    },
    async commitTransaction() {
      db.run('COMMIT;')
    },
    async rollbackTransaction() {
      db.run('ROLLBACK;')
    },
    async persist() {
      /* in-memory — nothing to flush */
    },
    async close() {
      db.close()
    },
  }
}
