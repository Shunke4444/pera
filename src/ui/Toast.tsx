import { useEffect, useState } from 'react'

// A tiny, provider-free toast: anywhere can fire `showToast(msg)` and the single
// <ToastHost/> mounted in AppLayout shows a brief confirmation pill. Uses a
// window CustomEvent so callers don't need context wiring or a store.

const EVENT = 'pera:toast'
const DURATION_MS = 2800

/** Fire a transient confirmation toast from anywhere. */
export function showToast(message: string): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }))
}

/** Mounts once (AppLayout). Listens for showToast() and shows a brief pill. */
export default function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onToast = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail)
      clearTimeout(timer)
      timer = setTimeout(() => setMsg(null), DURATION_MS)
    }
    window.addEventListener(EVENT, onToast)
    return () => {
      window.removeEventListener(EVENT, onToast)
      clearTimeout(timer)
    }
  }, [])

  if (!msg) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 left-1/2 z-50 max-w-[20rem] -translate-x-1/2 rounded-pill border border-border bg-surface-2 px-4 py-2 text-center text-sm text-text shadow-lg"
    >
      {msg}
    </div>
  )
}
