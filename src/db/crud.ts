// Thin row-level write helpers shared by repo.ts (all mutations) and migrate.ts
// (bulk copy from legacy Dexie). Keeps the encode-and-run boilerplate in one
// place; both go through sql.run so single writes persist, batched ones don't.

import { run } from './sql'
import { insertStmt, updateStmt, type Table } from './rows'

/** Insert one fully-formed domain object. */
export async function insertRow(table: Table, obj: Record<string, unknown>): Promise<void> {
  const [sql, values] = insertStmt(table, obj)
  await run(sql, values)
}

/** Apply a partial patch to one row (no-op when the patch touches no column). */
export async function updateRow(
  table: Table,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const stmt = updateStmt(table, id, patch)
  if (stmt) await run(stmt[0], stmt[1])
}
