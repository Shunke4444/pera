import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home,
  ArrowLeftRight,
  Wallet,
  Target,
  Moon,
  Sun,
  PieChart,
  Settings as SettingsIcon,
  Plus,
} from 'lucide-react'
import { applyTheme, getStoredTheme, resolveTheme, type Resolved } from '../theme'
import { setThemePref } from '../db/repo'
import AddTransactionSheet from '../components/AddTransactionSheet'
import SnapshotPublisher from '../native/SnapshotPublisher'

const TABS = [
  { to: '/', label: 'Home', Icon: Home },
  { to: '/activity', label: 'Activity', Icon: ArrowLeftRight },
  { to: '/budgets', label: 'Budgets', Icon: Wallet },
  { to: '/goals', label: 'Goals', Icon: Target },
] as const

export default function AppLayout({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Resolved>('dark')
  const [addOpen, setAddOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const stored = getStoredTheme()
    applyTheme(stored)
    setTheme(resolveTheme(stored))
  }, [])

  const toggleTheme = () => {
    const next: Resolved = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
    // Persist to the settings singleton too, so the DB-backed pref (used by
    // export) can't drift from what's actually painted. Matches Settings.tsx.
    void setThemePref(next)
  }

  return (
    <div className="relative mx-auto flex min-h-full max-w-sm flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg/90 px-5 py-4 backdrop-blur">
        <NavLink to="/" className="font-display text-xl font-bold tracking-tight">
          Pera
        </NavLink>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigate('/insights')}
            aria-label="Insights"
            className="rounded-pill border border-border p-2 text-muted hover:text-text"
          >
            <PieChart size={16} />
          </button>
          <button
            onClick={() => navigate('/settings')}
            aria-label="Settings"
            className="rounded-pill border border-border p-2 text-muted hover:text-text"
          >
            <SettingsIcon size={16} />
          </button>
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded-pill border border-border p-2 text-muted hover:text-text"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      <main className="flex-1 px-5 py-4 pb-24">{children}</main>

      <button
        onClick={() => setAddOpen(true)}
        aria-label="Add transaction"
        className="fixed bottom-20 right-[max(1.25rem,calc(50%-11rem+1.25rem))] z-30 grid h-14 w-14 place-items-center rounded-full bg-accent text-bg shadow-lg"
      >
        <Plus size={26} />
      </button>

      <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-sm -translate-x-1/2 border-t border-border bg-surface">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `inline-flex w-1/4 flex-col items-center gap-1 py-2 text-[11px] ${
                isActive ? 'text-accent' : 'text-dim'
              }`
            }
          >
            <Icon size={21} />
            {label}
          </NavLink>
        ))}
      </nav>

      <AddTransactionSheet open={addOpen} onClose={() => setAddOpen(false)} />
      <SnapshotPublisher />
    </div>
  )
}
