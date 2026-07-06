import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './ui/ErrorBoundary'
import './index.css'
import { initDb } from './db/db'
import { emitChange } from './db/changes'
import { seedIfEmpty } from './db/seed'
import { processDueRecurring } from './db/repo'
import { applyTheme, getStoredTheme } from './theme'
import { initDeepLinks } from './native/deepLink'
import { initWidgetRefresh } from './native/widgetRefresh'

// Paint the saved theme before first render to avoid a flash.
applyTheme(getStoredTheme())

// The widget reads/writes the SAME SQLite file directly now — no snapshot, no
// pending queue. So init just opens SQLite (schema + PRAGMAs + one-time Dexie→
// SQLite migration), seeds on first run (idempotent), catches up due recurring
// rules (idempotent), then fires one change so hooks mounted before init
// re-query (and, on native, nudges any placed widgets to re-read).
void initDb()
  .then(() => seedIfEmpty())
  .then(() => processDueRecurring())
  .then(() => emitChange())
  .catch((err) => console.error('Pera DB init failed', err))

// After every repo mutation, poke placed widgets to re-read SQLite (native only).
initWidgetRefresh()

// Route widget deep links (pera://quick-add?...) into the app. No-op on web.
void initDeepLinks()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
