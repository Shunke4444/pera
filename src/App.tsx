import { useEffect, useState } from 'react'
import { Home, ArrowLeftRight, Wallet, Target, Moon, Sun } from 'lucide-react'
import Dashboard from './screens/Dashboard'
import { applyTheme, getInitialTheme, type Theme } from './theme'

const TABS = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'activity', label: 'Activity', Icon: ArrowLeftRight },
  { id: 'budgets', label: 'Budgets', Icon: Wallet },
  { id: 'goals', label: 'Goals', Icon: Target }
] as const

export default function App() {
  const [tab, setTab] = useState<string>('home')
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const t = getInitialTheme()
    applyTheme(t)
    setTheme(t)
  }, [])

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <span className="font-display text-xl font-bold tracking-tight">Pera</span>
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="rounded-pill border border-border p-2 text-muted"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <main className="flex-1 px-5 py-4">
        {tab === 'home' ? <Dashboard /> : <Placeholder name={TABS.find((t) => t.id === tab)?.label ?? ''} />}
      </main>

      <nav className="flex border-t border-border bg-surface">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] ${
              tab === id ? 'text-accent' : 'text-dim'
            }`}
          >
            <Icon size={21} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="grid h-full place-items-center text-center text-muted">
      <div>
        <p className="font-display text-lg font-bold text-text">{name}</p>
        <p className="text-sm">Coming in the next build phase.</p>
      </div>
    </div>
  )
}
