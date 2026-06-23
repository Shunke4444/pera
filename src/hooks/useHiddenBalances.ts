import { useSyncExternalStore } from 'react'

// Global "hide balances" toggle, persisted in localStorage and shared across
// every screen via an external store so flipping the eye on the dashboard masks
// amounts everywhere at once.
const KEY = 'pera-balances-hidden'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function setHiddenBalances(hidden: boolean): void {
  try {
    localStorage.setItem(KEY, hidden ? '1' : '0')
  } catch {
    /* storage unavailable — keep in-memory only */
  }
  listeners.forEach((cb) => cb())
}

/** `[hidden, toggle]` — reactive, persisted balance-visibility state. */
export function useHiddenBalances(): [boolean, () => void] {
  const hidden = useSyncExternalStore(subscribe, read, () => false)
  return [hidden, () => setHiddenBalances(!hidden)]
}
