import { Component, useState, type ReactNode } from 'react'
import { exportData } from '../db/repo'
import { downloadText, stampedName } from '../lib/download'

/**
 * Top-level safety net. A render throw anywhere below would otherwise blank the
 * whole screen (white screen of death) and trap the user's only copy of their
 * data on-device. Instead we show a recoverable message with the error, a
 * reload, and a one-tap data export so a crash can never lose local data.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    // Keep a trace in the console for debugging; never swallow silently.
    console.error('Pera crashed:', error, info)
  }

  render() {
    if (this.state.error) return <Fallback error={this.state.error} />
    return this.props.children
  }
}

function Fallback({ error }: { error: Error }) {
  const [exported, setExported] = useState(false)
  const [exportErr, setExportErr] = useState('')

  const exportNow = async () => {
    setExportErr('')
    try {
      const data = await exportData()
      downloadText(stampedName('pera-backup', 'json'), JSON.stringify(data, null, 2))
      setExported(true)
    } catch {
      setExportErr('Could not export automatically — open Settings → Export if you can.')
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-bg px-5 text-text">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-5">
        <p className="font-display text-lg font-bold tracking-tight">Something broke</p>
        <p className="mt-1 text-sm text-muted">
          Pera hit an unexpected error. Your data is still safe on this device — export a copy,
          then reload.
        </p>

        <pre className="mt-3 max-h-32 overflow-auto rounded-tile border border-border bg-bg p-2.5 text-xs text-neg">
          {error.message || String(error)}
        </pre>

        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => window.location.reload()}
            className="rounded-tile bg-accent px-4 py-2.5 text-sm font-semibold text-bg"
          >
            Reload
          </button>
          <button
            onClick={exportNow}
            className="rounded-tile border border-border px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-2"
          >
            {exported ? 'Exported ✓ — export again' : 'Export my data'}
          </button>
        </div>

        {exportErr && <p className="mt-2 text-xs text-neg">{exportErr}</p>}
      </div>
    </div>
  )
}
