import type { Account, Category, Transaction } from '../db/types'
import { formatSignedPHP } from '../lib/money'
import { Dot, EmptyState } from '../ui/common'

function dayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function amountClass(t: Transaction): string {
  if (t.type === 'transfer' || t.type === 'adjustment') return 'text-muted'
  return t.amount >= 0 ? 'text-pos' : 'text-neg'
}

export default function TransactionList({
  txns,
  categories,
  accounts,
  emptyHint = 'Nothing here yet.',
  onRowClick,
  selectable,
  selected,
  onToggle,
}: {
  txns: Transaction[]
  categories: Category[]
  accounts?: Account[]
  emptyHint?: string
  onRowClick?: (t: Transaction) => void
  selectable?: boolean
  selected?: Set<string>
  onToggle?: (id: string) => void
}) {
  if (txns.length === 0) {
    return <EmptyState title="No transactions" hint={emptyHint} />
  }

  const catName = (id?: string) => categories.find((c) => c.id === id)?.name
  const catColor = (id?: string) => categories.find((c) => c.id === id)?.color
  const acctName = (id: string) => accounts?.find((a) => a.id === id)?.name

  // Group by local day, newest first (txns are expected pre-sorted desc).
  const sorted = [...txns].sort((a, b) => b.date - a.date)
  const groups: { day: string; items: Transaction[] }[] = []
  for (const t of sorted) {
    const day = dayLabel(t.date)
    let g = groups.find((x) => x.day === day)
    if (!g) {
      g = { day, items: [] }
      groups.push(g)
    }
    g.items.push(t)
  }

  const primary = (t: Transaction): string => {
    if (t.type === 'transfer') return 'Transfer'
    if (t.type === 'adjustment') return 'Balance adjustment'
    return catName(t.categoryId) ?? (t.type === 'income' ? 'Income' : 'Expense')
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.day} className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-dim">{g.day}</p>
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            {g.items.map((t, i) => (
              <div
                key={t.id}
                className={`flex items-center gap-3 px-3.5 py-2.5 ${
                  i > 0 ? 'border-t border-border' : ''
                }`}
              >
                {selectable && (
                  <input
                    type="checkbox"
                    className="h-4 w-4 flex-none accent-accent"
                    checked={selected?.has(t.id) ?? false}
                    onChange={() => onToggle?.(t.id)}
                    aria-label="Select transaction"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onRowClick?.(t)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Dot color={catColor(t.categoryId)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{primary(t)}</p>
                    <p className="truncate text-xs text-dim">
                      {accounts ? acctName(t.accountId) : null}
                      {accounts && t.note ? ' · ' : null}
                      {t.note}
                    </p>
                  </div>
                  <span
                    className={`flex-none font-display text-sm font-bold tabular-nums ${amountClass(t)}`}
                  >
                    {formatSignedPHP(t.amount)}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
