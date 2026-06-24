import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Stand in for the native shared-storage queue the Glance preset callback writes
// to while the webview is dead. Kept in-memory so the test runs in the `node`
// env (no localStorage / Preferences) and asserts the real drain → DB path.
const store = vi.hoisted(() => ({ queue: null as string | null }))

vi.mock('./pendingStore', () => ({
  PENDING_KEY: 'pera.widget.pending',
  readPendingRaw: async () => store.queue,
  clearPendingQueue: async () => {
    store.queue = null
  },
}))

import { db } from '../db/db'
import { syncWidgets } from './deepLink'

beforeEach(async () => {
  await db.delete()
  await db.open()
  store.queue = null
})

describe('syncWidgets — warm-resume widget drain', () => {
  it('drains a preset logged while the app was backgrounded', async () => {
    // The widget logged this while we were away; nothing drained it yet.
    store.queue = JSON.stringify([
      { id: 'pend-resume', accountId: 'gcash', amount: -12300, type: 'expense', date: 1_700_000_000_000 },
    ])

    await syncWidgets() // exactly what the appStateChange(isActive) handler calls on resume

    const drained = (await db.transactions.toArray()).filter((t) => t.pendingId === 'pend-resume')
    expect(drained).toHaveLength(1)
    expect(drained[0].amount).toBe(-12300)
    expect(store.queue).toBeNull() // queue cleared after a successful drain
  })
})
