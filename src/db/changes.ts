// Tiny "data changed" event bus — the reactivity primitive that replaces Dexie's
// useLiveQuery. Every repo mutation calls emitChange() after it writes; hooks
// subscribe and re-run their query. One process, synchronous fan-out, no deps.

type Listener = () => void

const listeners = new Set<Listener>()

/** Subscribe to post-write signals; returns an unsubscribe fn. */
export function subscribeChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Notify every subscriber that the database changed. Fired after each write. */
export function emitChange(): void {
  for (const fn of [...listeners]) fn()
}
