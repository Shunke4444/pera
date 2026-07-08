// SQLite schema — mirrors the Dexie tables in db/types.ts EXACTLY (same fields,
// same semantics). Money stays integer minor units (INTEGER). Booleans are
// 0/1 INTEGER. Optional fields are nullable columns (NULL ⇔ undefined on read).
// settings.quickAddPresets rides as a JSON TEXT blob.
//
// The plugin appends "SQLite.db" to the connection name, so DB_NAME 'pera'
// yields the shared file peraSQLite.db that native Kotlin will open in Phase 4.

export const DB_NAME = 'pera'
export const DB_VERSION = 1

// WAL = one writer + many readers concurrently (the WebView and, later, the
// widget share the file); busy_timeout avoids SQLITE_BUSY under contention.
// PRAGMAs can't run inside a transaction — executed on their own.
export const PRAGMAS = `
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
PRAGMA foreign_keys=OFF;
`

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  bank TEXT NOT NULL,
  type TEXT NOT NULL,
  currency TEXT NOT NULL,
  openingBalance INTEGER NOT NULL,
  isIncomeSource INTEGER,
  color TEXT,
  icon TEXT,
  archived INTEGER NOT NULL,
  sortOrder INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  categoryId TEXT,
  transferAccountId TEXT,
  transferGroupId TEXT,
  goalId TEXT,
  date INTEGER NOT NULL,
  note TEXT,
  importBatchId TEXT,
  importHash TEXT,
  recurringId TEXT,
  pendingId TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  categoryId TEXT NOT NULL,
  amount INTEGER NOT NULL,
  period TEXT NOT NULL,
  rollover INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  targetAmount INTEGER NOT NULL,
  targetDate INTEGER,
  linkedAccountId TEXT,
  color TEXT,
  icon TEXT,
  archived INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  baseCurrency TEXT NOT NULL,
  theme TEXT NOT NULL,
  lastBackupAt INTEGER,
  monthlyBudget INTEGER,
  defaultAccountId TEXT,
  quickAddPresets TEXT
);

CREATE TABLE IF NOT EXISTS recurring (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  categoryId TEXT,
  note TEXT,
  freq TEXT NOT NULL,
  interval INTEGER NOT NULL,
  anchorDay INTEGER,
  startDate INTEGER NOT NULL,
  endDate INTEGER,
  nextRunDate INTEGER NOT NULL,
  autoPost INTEGER NOT NULL,
  lastPostedDate INTEGER,
  archived INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_txn_account ON transactions(accountId);
CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(categoryId);
CREATE INDEX IF NOT EXISTS idx_txn_group ON transactions(transferGroupId);
CREATE INDEX IF NOT EXISTS idx_txn_batch ON transactions(importBatchId);
CREATE INDEX IF NOT EXISTS idx_txn_hash ON transactions(importHash);
CREATE INDEX IF NOT EXISTS idx_txn_recurring ON transactions(recurringId);
CREATE INDEX IF NOT EXISTS idx_txn_pending ON transactions(pendingId);
CREATE INDEX IF NOT EXISTS idx_txn_goal ON transactions(goalId);
CREATE INDEX IF NOT EXISTS idx_budget_category ON budgets(categoryId);
CREATE INDEX IF NOT EXISTS idx_recurring_account ON recurring(accountId);
`

/**
 * Individual schema statements split from SCHEMA, so the Android Capacitor
 * SQLite plugin can execute them one at a time via execSQL() (which doesn't
 * handle multi-statement strings). One statement's failure won't prevent
 * others from being created.
 */
export const SCHEMA_STATEMENTS: string[] = SCHEMA
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0)
  .map((s) => s + ';')

/** The seven domain tables, for bulk clears (import/restore, test reset). */
export const TABLES = [
  'accounts',
  'transactions',
  'categories',
  'budgets',
  'goals',
  'settings',
  'recurring',
] as const
