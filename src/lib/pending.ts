// Pure logic for the native widget "pending log" queue. When a widget preset is
// tapped the native side appends a pending transaction to shared storage and
// optimistically updates the snapshot — no UI, no IndexedDB (the webview isn't
// running). On next app launch the web app DRAINS that queue into IndexedDB.
//
// The one correctness rule: draining must be IDEMPOTENT BY PENDING ID, so a
// queue that wasn't cleared (crash, killed mid-write) never double-posts. This
// module is the pure, unit-tested core; `db/repo.drainPendingQueue` wires it to
// Preferences + Dexie. No React, no Dexie, no Capacitor here.

export interface PendingTxn {
  id: string // unique pending id, generated natively (the dedupe key)
  accountId: string
  amount: number // signed minor units (+income / -expense)
  type: 'expense' | 'income'
  categoryId?: string
  date: number // epoch ms
}

export interface DrainPlan {
  toAdd: PendingTxn[] // pendings to import, in queue order, deduped
  skipped: string[] // ids skipped (already imported, or repeated in this batch)
}

/** A record looks like a usable PendingTxn (defensive against partial writes). */
function isPending(x: unknown): x is PendingTxn {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    r.id !== '' &&
    typeof r.accountId === 'string' &&
    r.accountId !== '' &&
    typeof r.amount === 'number' &&
    Number.isFinite(r.amount) &&
    (r.type === 'expense' || r.type === 'income') &&
    typeof r.date === 'number'
  )
}

/** Parse the raw queue JSON (a PendingTxn[]). Tolerant: [] on absent/bad/non-array. */
export function parsePendingQueue(raw: string | null | undefined): PendingTxn[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPending)
  } catch {
    return []
  }
}

/**
 * Decide which pending transactions to import. Idempotent by pending id: any id
 * already in `existingIds` (already drained into IndexedDB) is skipped, and an
 * id repeated within the incoming queue is imported only once. Order preserved.
 */
export function planDrain(pending: PendingTxn[], existingIds: Set<string>): DrainPlan {
  const toAdd: PendingTxn[] = []
  const skipped: string[] = []
  const seen = new Set(existingIds)
  for (const item of pending) {
    if (seen.has(item.id)) {
      skipped.push(item.id)
      continue
    }
    seen.add(item.id)
    toAdd.push(item)
  }
  return { toAdd, skipped }
}
