// Web → native data bridge. The home-screen widget can't read the webview's
// IndexedDB, so the app publishes a tiny snapshot the native side can read.
//
// P1: build the snapshot + mirror it to localStorage (web/dev visibility).
// P3 augments publishSnapshot() to also write it to native shared storage via
// @capacitor/preferences and to poke the widget to refresh.

import { Capacitor } from '@capacitor/core'
import { db } from '../db/db'
import { netWorth, overallSpent, accountBalance, monthKey } from './balances'

export interface WidgetSnapshot {
  netWorth: number // minor units
  monthBudgetSpent: number // minor units, this month's total expense
  monthBudgetCap: number | null // minor units, overall monthly budget; null = unset
  currency: string
  updatedAt: number // epoch ms
  topAccount?: { name: string; balance: number } // richest visible account
}

/** Native Preferences key + localStorage mirror key. */
export const SNAPSHOT_KEY = 'pera.widget.snapshot'

/** Read the live data and assemble the widget snapshot. */
export async function buildSnapshot(nowMs: number = Date.now()): Promise<WidgetSnapshot> {
  const [accounts, txns, settings] = await Promise.all([
    db.accounts.toArray(),
    db.transactions.toArray(),
    db.settings.get('singleton'),
  ])
  const visible = accounts.filter((a) => !a.archived)
  const month = monthKey(nowMs)

  let topAccount: WidgetSnapshot['topAccount']
  for (const a of visible) {
    const bal = accountBalance(a, txns)
    if (!topAccount || bal > topAccount.balance) topAccount = { name: a.name, balance: bal }
  }

  return {
    netWorth: netWorth(visible, txns),
    monthBudgetSpent: overallSpent(txns, month),
    monthBudgetCap: settings?.monthlyBudget ?? null,
    currency: settings?.baseCurrency ?? 'PHP',
    updatedAt: nowMs,
    topAccount,
  }
}

/**
 * Build + publish the snapshot. Called on app start and after every transaction
 * write. Always mirrors to localStorage; on a native build it also writes to
 * @capacitor/preferences and triggers a widget refresh (added in P3). Never
 * throws — a snapshot failure must not break a save.
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
 * Glance widget reads from SharedPreferences) and poke the widget to refresh.
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
