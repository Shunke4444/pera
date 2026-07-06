import { Capacitor } from '@capacitor/core'

// Widget "open app" taps deep-link into the app (pera://quick-add?type=...).
// Capacitor's App plugin surfaces the URL via appUrlOpen (warm) / getLaunchUrl
// (cold); we translate it into a HashRouter route. No-op on web.
//
// The widget reads/writes SQLite directly now, so there's nothing to drain or
// republish on resume — this is purely routing for an explicit open-app tap.

/** Pull the quick-add query out of any incoming URL and route to it. */
function routeFromUrl(url: string): void {
  const i = url.indexOf('quick-add')
  if (i === -1) return
  const q = url.indexOf('?', i)
  const query = q >= 0 ? url.slice(q) : ''
  // HashRouter: setting the hash navigates, and works on a cold launch too.
  window.location.hash = `#/quick-add${query}`
}

/** Register deep-link handling. Safe to call on web (does nothing there). */
export async function initDeepLinks(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { App } = await import('@capacitor/app')
    await App.addListener('appUrlOpen', ({ url }) => routeFromUrl(url))
    const launch = await App.getLaunchUrl()
    if (launch?.url) routeFromUrl(launch.url)
  } catch {
    /* @capacitor/app unavailable — ignore */
  }
}
