// The minimal SQL surface the data layer needs. Two implementations back it:
//  - capacitor.ts — @capacitor-community/sqlite (native Android + web via
//    jeep-sqlite WASM), the runtime driver.
//  - sqljs.ts — sql.js in-memory (node), the test driver.
// Keeping this tiny means repo.ts is written once and runs everywhere.

export type SqlValue = string | number | null

export interface SqlDriver {
  /** Run one or more statements with no bound params (DDL, PRAGMAs). */
  execute(sql: string): Promise<void>
  /** SELECT → rows as plain column→value objects. */
  query<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>
  /** A single parameterized write (INSERT/UPDATE/DELETE). */
  run(sql: string, params?: SqlValue[]): Promise<void>
  beginTransaction(): Promise<void>
  commitTransaction(): Promise<void>
  rollbackTransaction(): Promise<void>
  /** Flush to durable storage (web: saveToStore; native/test: no-op). */
  persist(): Promise<void>
  close(): Promise<void>
}
