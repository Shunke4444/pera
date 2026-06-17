export type Theme = 'dark' | 'light' | 'system'
export type Resolved = 'dark' | 'light'

function systemPref(): Resolved {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** The concrete appearance a theme choice resolves to right now. */
export function resolveTheme(t: Theme): Resolved {
  return t === 'system' ? systemPref() : t
}

/** The stored preference ('system' when unset/invalid). */
export function getStoredTheme(): Theme {
  const s = localStorage.getItem('pera-theme')
  return s === 'dark' || s === 'light' || s === 'system' ? s : 'system'
}

/** Persist the preference and paint the resolved appearance on <html>. */
export function applyTheme(t: Theme): void {
  localStorage.setItem('pera-theme', t)
  document.documentElement.setAttribute('data-theme', resolveTheme(t))
}
