import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { seedIfEmpty } from './db/seed'
import { applyTheme, getStoredTheme } from './theme'

// Paint the saved theme before first render to avoid a flash.
applyTheme(getStoredTheme())

// First-run seed (4 accounts, default categories, settings). Idempotent.
void seedIfEmpty()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
