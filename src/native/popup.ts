import { Capacitor } from '@capacitor/core'

// The native quick-add pop-up is a dialog-themed BridgeActivity that loads the
// SAME web app (same origin → same IndexedDB) at /#/quick-add?...&popup=1. The
// web side detects that flag to (a) render only the bare quick-add card — no
// header / tab bar — and (b) finish the Activity after a save.

/** True when running inside the native quick-add pop-up window. */
export function isPopup(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hash.includes('popup=1')
}

/** Close the pop-up Activity. No-op on web / in the main app window. */
export async function dismissPopup(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { WidgetBridge } = await import('./widget')
    await WidgetBridge.dismissPopup()
  } catch {
    /* plugin missing — ignore */
  }
}
