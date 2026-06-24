import { Capacitor } from '@capacitor/core'

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
