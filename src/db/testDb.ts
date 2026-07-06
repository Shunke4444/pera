// Test-only DB bootstrap: an in-memory sql.js SQLite (real SQLite engine, no
// native plugin, no IndexedDB) so the repo tests exercise the SAME SQL the app
// runs. Call resetTestDb() in beforeEach — it creates the driver + schema once,
// then wipes every table between tests.

import { createSqlJsDriver } from './driver/sqljs'
import { setDriver, hasDriver, execute } from './sql'
import { PRAGMAS, SCHEMA, TABLES } from './schema'

let schemaReady = false

export async function resetTestDb(): Promise<void> {
  if (!schemaReady) {
    if (!hasDriver()) setDriver(await createSqlJsDriver())
    await execute(PRAGMAS)
    await execute(SCHEMA)
    schemaReady = true
  }
  await execute([...TABLES, 'meta'].map((t) => `DELETE FROM ${t};`).join('\n'))
}
