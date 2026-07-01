// Web → native data bridge. The home-screen widgets can't read the webview's
// IndexedDB, so the app publishes a small JSON snapshot the native side reads.
//
// v2 (024): the snapshot feeds FOUR widgets, so it carries budget detail + top
// categories, goals, recent transactions and the quick-add presets — not just a
// net-worth line. `buildSnapshotData` is the pure, unit-tested core; the async
// `buildSnapshot` loads the live data and `publishSnapshot` mirrors + writes it.

import { Capacitor } from '@capacitor/core'
import { db } from '../db/db'
import type {
  Account,
  Budget,
  Category,
  Goal,
  Settings,
  Transaction,
  TransactionType,
} from '../db/types'
import {
  accountBalance,
  assetsLiabilities,
  goalProgress,
  monthKey,
  netWorth,
  overallSpent,
} from './balances'
import { budgetStatus, projectedMonthEnd, type BudgetLevel } from './budgets'
import { goalStats } from './goals'
import { spendingByCategory } from './insights'

export interface SnapshotBudget {
  spent: number // minor units, this month's total expense
  cap: number // minor units, overall monthly budget
  level: BudgetLevel // 'ok' | 'warn' | 'over'
  remaining: number // cap - spent (negative when over)
  daysLeft: number // calendar days remaining in the month
  projected: number // linear month-end projection, minor units
  topCategories: { name: string; color: string; spent: number; cap?: number }[]
}

export interface SnapshotGoal {
  name: string
  color: string
  pct: number // 0..100
  saved: number
  target: number
}

export interface SnapshotRecent {
  date: number // epoch ms
  label: string
  signedAmount: number // minor units, signed
  type: TransactionType
}

export interface SnapshotPreset {
  id: string
  label: string
  amount: number // positive minor-unit magnitude
  type: 'expense' | 'income'
  categoryId?: string
  accountId: string // resolved to a concrete account (preset → default → first)
}

// The native quick-add dialog (no webview) needs the account + category lists to
// render its chips; they aren't in IndexedDB reach from Kotlin, so they ride the
// snapshot like everything else. Tiny text — a handful of rows.
export interface SnapshotAccount {
  id: string
  name: string
  color?: string
}

export interface SnapshotCategory {
  id: string
  name: string
  kind: 'income' | 'expense'
  color: string
}

export interface WidgetSnapshot {
  netWorth: number // minor units
  assets: number // minor units (Σ positive balances)
  liabilities: number // minor units (Σ negative balances, ≤ 0)
  currency: string
  updatedAt: number // epoch ms
  budget: SnapshotBudget | null // null = no overall monthly budget set
  goals: SnapshotGoal[]
  recent: SnapshotRecent[]
  presets: SnapshotPreset[]
  accounts: SnapshotAccount[] // visible accounts (native quick-add dialog chips)
  categories: SnapshotCategory[] // expense + income categories (dialog chips)
  defaultAccountId?: string // account the dialog preselects (default → first)
  topAccount?: { name: string; balance: number } // richest visible account
}

/** Native Preferences key + localStorage mirror key for the snapshot. */
export const SNAPSHOT_KEY = 'pera.widget.snapshot'

const MAX_TOP_CATEGORIES = 3
const MAX_GOALS = 4
const MAX_RECENT = 5
const MAX_PRESETS = 4

const DEFAULT_GOAL_COLOR = '#34D399'

const TYPE_LABEL: Record<TransactionType, string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
  adjustment: 'Adjustment',
  goal: 'Goal',
}

export interface SnapshotInput {
  accounts: Account[]
  txns: Transaction[]
  categories: Category[]
  budgets: Budget[]
  goals: Goal[]
  settings: Settings | undefined
  nowMs: number
}

/**
 * Pure snapshot builder over plain arrays — no Dexie, so it's unit-testable and
 * is the single source of the published shape. All money stays integer minor
 * units, matching the rest of the app.
 */
export function buildSnapshotData(input: SnapshotInput): WidgetSnapshot {
  const { txns, categories, budgets, goals, settings, nowMs } = input
  const visible = input.accounts.filter((a) => !a.archived)
  const month = monthKey(nowMs)
  const { assets, liabilities } = assetsLiabilities(visible, txns)

  let topAccount: WidgetSnapshot['topAccount']
  for (const a of visible) {
    const bal = accountBalance(a, txns)
    if (!topAccount || bal > topAccount.balance) topAccount = { name: a.name, balance: bal }
  }

  return {
    netWorth: netWorth(visible, txns),
    assets,
    liabilities,
    currency: settings?.baseCurrency ?? 'PHP',
    updatedAt: nowMs,
    budget: buildBudget(txns, categories, budgets, settings, month, nowMs),
    goals: buildGoals(goals, txns, visible),
    recent: buildRecent(txns, categories),
    presets: buildPresets(settings, visible),
    accounts: visible.map((a) => ({ id: a.id, name: a.name, color: a.color })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      color: c.color,
    })),
    defaultAccountId: settings?.defaultAccountId ?? visible[0]?.id,
    topAccount,
  }
}

function buildBudget(
  txns: Transaction[],
  categories: Category[],
  budgets: Budget[],
  settings: Settings | undefined,
  month: string,
  nowMs: number,
): SnapshotBudget | null {
  const cap = settings?.monthlyBudget
  if (cap == null) return null
  const spent = overallSpent(txns, month)
  const status = budgetStatus(cap, spent)
  const d = new Date(nowMs)
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const capByCat = new Map(budgets.map((b) => [b.categoryId, b.amount]))
  const topCategories = spendingByCategory(txns, categories, month)
    .slice(0, MAX_TOP_CATEGORIES)
    .map((s) => ({ name: s.name, color: s.color, spent: s.total, cap: capByCat.get(s.categoryId) }))
  return {
    spent,
    cap,
    level: status.level,
    remaining: status.remaining,
    daysLeft: daysInMonth - d.getDate(),
    projected: projectedMonthEnd(spent, nowMs),
    topCategories,
  }
}

function buildGoals(goals: Goal[], txns: Transaction[], accounts: Account[]): SnapshotGoal[] {
  return goals
    .filter((g) => !g.archived)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, MAX_GOALS)
    .map((g) => {
      const saved = goalProgress(g, txns, accounts)
      const stats = goalStats(g.targetAmount, saved)
      return {
        name: g.name,
        color: g.color ?? DEFAULT_GOAL_COLOR,
        pct: stats.pct,
        saved,
        target: g.targetAmount,
      }
    })
}

function buildRecent(txns: Transaction[], categories: Category[]): SnapshotRecent[] {
  const catName = new Map(categories.map((c) => [c.id, c.name]))
  return txns
    .filter((t) => t.type !== 'goal') // virtual earmarks aren't real money movement
    .slice()
    .sort((a, b) => b.date - a.date)
    .slice(0, MAX_RECENT)
    .map((t) => ({
      date: t.date,
      label: t.note || (t.categoryId ? catName.get(t.categoryId) : undefined) || TYPE_LABEL[t.type],
      signedAmount: t.amount,
      type: t.type,
    }))
}

function buildPresets(settings: Settings | undefined, accounts: Account[]): SnapshotPreset[] {
  const presets = settings?.quickAddPresets ?? []
  if (presets.length === 0) return []
  const fallback = settings?.defaultAccountId ?? accounts[0]?.id
  const valid = new Set(accounts.map((a) => a.id))
  return presets.slice(0, MAX_PRESETS).map((p) => {
    const accountId = p.accountId && valid.has(p.accountId) ? p.accountId : (fallback ?? '')
    return {
      id: p.id,
      label: p.label,
      amount: p.amount,
      type: p.type,
      categoryId: p.categoryId,
      accountId,
    }
  })
}

/** Read the live data and assemble the widget snapshot. */
export async function buildSnapshot(nowMs: number = Date.now()): Promise<WidgetSnapshot> {
  const [accounts, txns, categories, budgets, goals, settings] = await Promise.all([
    db.accounts.toArray(),
    db.transactions.toArray(),
    db.categories.toArray(),
    db.budgets.toArray(),
    db.goals.toArray(),
    db.settings.get('singleton'),
  ])
  return buildSnapshotData({ accounts, txns, categories, budgets, goals, settings, nowMs })
}

/**
 * Build + publish the snapshot. Called on app start and after every write.
 * Always mirrors to localStorage; on a native build it also writes to
 * @capacitor/preferences and triggers a widget refresh. Never throws — a
 * snapshot failure must not break a save.
 */
export async function publishSnapshot(): Promise<void> {
  try {
    const snap = await buildSnapshot()
    const json = JSON.stringify(snap)
    try {
      localStorage.setItem(SNAPSHOT_KEY, json)
    } catch {
      /* private mode / quota — non-fatal */
    }
    await writeNative(json)
  } catch {
    /* snapshot is best-effort; never block the caller */
  }
}

/**
 * Native sink for the snapshot: write it to @capacitor/preferences (which the
 * Glance widgets read from SharedPreferences) and poke the widgets to refresh.
 * No-op on the web. Best-effort — never throws.
 */
async function writeNative(json: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { Preferences } = await import('@capacitor/preferences')
    await Preferences.set({ key: SNAPSHOT_KEY, value: json })
  } catch {
    /* preferences unavailable — skip */
  }
  try {
    const { WidgetBridge } = await import('../native/widget')
    await WidgetBridge.refresh()
  } catch {
    /* no widgets placed / plugin missing — fine */
  }
}
