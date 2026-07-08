import { Capacitor } from '@capacitor/core'
import { subscribeChange } from '../db/changes'

// Keep placed home-screen widgets in sync with in-app edits. Since the widget
// reads the SAME SQLite file (032 pivot), a repo mutation is already durable —
// the widgets just need a nudge to recompose and re-run their SQL. Every repo
// write fires emitChange(); we listen and call WidgetBridge.refresh() (native
// updateAll). No-op on web. Coalesced so a burst of writes → one refresh.

let scheduled = false

async function refresh(): Promise<void> {
  try {
    const { WidgetBridge } = await import('./widget')
    await WidgetBridge.refresh()
  } catch (e) {
    console.warn('[Pera] WidgetBridge.refresh failed —', e)
  }
}

/** Subscribe widget refresh to the data-changed bus. Native only; call once. */
export function initWidgetRefresh(): void {
  if (!Capacitor.isNativePlatform()) return
  subscribeChange(() => {
    if (scheduled) return
    scheduled = true
    // Debounce a write burst (e.g. a transfer's two legs) into a single refresh.
    setTimeout(() => {
      scheduled = false
      void refresh()
    }, 150)
  })
}
