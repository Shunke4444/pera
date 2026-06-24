import { Capacitor } from '@capacitor/core'
import { drainPendingQueue } from '../db/repo'
import { publishSnapshot } from '../lib/snapshot'

// Widget buttons open the app with a deep link (pera://quick-add?type=...).
// Capacitor's App plugin surfaces it via appUrlOpen (warm) / getLaunchUrl
// (cold); we translate it into a HashRouter route. No-op on web.

/** Pull the quick-add query out of any incoming URL and route to it. */
function routeFromUrl(url: string): void {
  const i = url.indexOf('quick-add')
  if (i === -1) return
  const q = url.indexOf('?', i)
  const query = q >= 0 ? url.slice(q) : ''
  // HashRouter: setting the hash navigates, and works on a cold launch too.
  window.location.hash = `#/quick-add${query}`
}

// Resume + a deep link can both fire on the same foregrounding; chain the work
// so two drains can't read the SAME queue before either clears it (drain is
// idempotent across separate runs, not concurrent ones — that would double-post).
let widgetSync: Promise<void> = Promise.resolve()

/**
 * Pull anything the widgets logged while the webview was dead — preset taps
 * queued in shared storage — into IndexedDB, then republish the snapshot so the
 * widgets reflect it. Serialized + best-effort; safe on web (drains the
 * localStorage mirror, a no-op when the queue is empty). This is what the
 * warm-foreground (appStateChange) handler calls on resume.
 */
export function syncWidgets(): Promise<void> {
  widgetSync = widgetSync
    .catch(() => {})
    .then(() => drainPendingQueue())
    .then(() => publishSnapshot())
    .catch(() => {})
  return widgetSync
}

/** Register deep-link handling. Safe to call on web (does nothing there). */
export async function initDeepLinks(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { App } = await import('@capacitor/app')
    await App.addListener('appUrlOpen', async ({ url }) => {
      // A widget button can log a preset AND open the app; drain first so the
      // quick-add screen opens against fresh data.
      await syncWidgets()
      routeFromUrl(url)
    })
    // Warm foreground: the OS resumed us (e.g. after a background preset-log).
    // Cold launch drains in main.tsx; this covers every resume after that.
    await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void syncWidgets()
    })
    const launch = await App.getLaunchUrl()
    if (launch?.url) routeFromUrl(launch.url)
  } catch {
    /* @capacitor/app unavailable — ignore */
  }
}
