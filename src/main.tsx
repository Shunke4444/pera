import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './ui/ErrorBoundary'
import './index.css'
import { seedIfEmpty } from './db/seed'
import { processDueRecurring } from './db/repo'
import { applyTheme, getStoredTheme } from './theme'

// Paint the saved theme before first render to avoid a flash.
applyTheme(getStoredTheme())

// First-run seed (4 accounts, default categories, settings). Idempotent.
// Then catch up any due recurring rules (also idempotent — safe every start).
void seedIfEmpty().then(() => processDueRecurring())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
