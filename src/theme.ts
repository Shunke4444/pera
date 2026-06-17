export type Theme = 'dark' | 'light'

export function getInitialTheme(): Theme {
  const saved = localStorage.getItem('pera-theme') as Theme | null
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('pera-theme', theme)
}
