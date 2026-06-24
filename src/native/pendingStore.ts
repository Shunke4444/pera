import { Capacitor } from '@capacitor/core'

// IO for the native widget "pending log" queue. The Glance preset callback
// appends pending transactions here (via SharedPreferences, the same store
// @capacitor/preferences uses); the web app reads + clears it on launch and
// drains it into IndexedDB. The pure drain logic lives in lib/pending.ts.

/** Native Preferences key + localStorage mirror key for the pending queue. */
export const PENDING_KEY = 'pera.widget.pending'

/** Read the raw queue JSON (a PendingTxn[]), or null if absent. */
export async function readPendingRaw(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Preferences } = await import('@capacitor/preferences')
      return (await Preferences.get({ key: PENDING_KEY })).value
    } catch {
      return null
    }
  }
  try {
    return localStorage.getItem(PENDING_KEY)
  } catch {
    return null
  }
}

/** Clear the queue after a successful drain. Best-effort — never throws. */
export async function clearPendingQueue(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.remove({ key: PENDING_KEY })
    } catch {
      /* ignore */
    }
    return
  }
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    /* ignore */
  }
}
