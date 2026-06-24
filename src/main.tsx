import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './ui/ErrorBoundary'
import './index.css'
import { seedIfEmpty } from './db/seed'
import { processDueRecurring, drainPendingQueue } from './db/repo'
import { applyTheme, getStoredTheme } from './theme'
import { publishSnapshot } from './lib/snapshot'
import { initDeepLinks } from './native/deepLink'

// Paint the saved theme before first render to avoid a flash.
applyTheme(getStoredTheme())

// First-run seed (4 accounts, default categories, settings). Idempotent.
// Then catch up any due recurring rules (also idempotent — safe every start),
// drain any pending widget preset-logs into IndexedDB (idempotent by pending
// id), and finally publish the true widget snapshot once the data is settled.
void seedIfEmpty()
  .then(() => processDueRecurring())
  .then(() => drainPendingQueue())
  .then(() => publishSnapshot())

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
