import { useState } from 'react'
import { Plus, Pause, Play, ChevronLeft, Repeat } from 'lucide-react'
import { useAllRecurring, useAccounts } from '../hooks'
import { archiveRecurring } from '../db/repo'
import { formatSignedPHP } from '../lib/money'
import type { RecurringRule } from '../db/types'
import { Button } from '../ui/form'
import { EmptyState } from '../ui/common'
import RecurringForm from './RecurringForm'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function describeSchedule(rule: RecurringRule): string {
  const unit = rule.freq === 'weekly' ? 'week' : rule.freq === 'yearly' ? 'year' : 'month'
  const cadence = rule.interval > 1 ? `Every ${rule.interval} ${unit}s` : `Every ${unit}`
  if (rule.freq === 'weekly') return `${cadence} on ${WEEKDAYS[rule.anchorDay ?? 0]}`
  if (rule.freq === 'monthly') return `${cadence} on day ${rule.anchorDay}`
  return cadence
}

const dateLabel = (ms: number) =>
  new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** Manage recurring rules: list (active + paused) with add / edit / pause. */
export default function RecurringManager() {
  const rules = useAllRecurring()
  const accounts = useAccounts()
  const [view, setView] = useState<{ rule?: RecurringRule } | null>(null)

  const acctName = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'Account'

  if (view) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => setView(null)}
          className="-ml-1 inline-flex items-center text-sm text-muted hover:text-text"
        >
          <ChevronLeft size={18} /> Back
        </button>
        <RecurringForm rule={view.rule} onDone={() => setView(null)} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setView({})}
          className="inline-flex items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text"
        >
          <Plus size={14} /> Add recurring
        </button>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          title="No recurring items"
          hint="Add salary, rent, or subscriptions so they post on schedule."
          action={<Button onClick={() => setView({})}>Add your first</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {rules.map((r, i) => {
            const signed = r.type === 'income' ? Math.abs(r.amount) : -Math.abs(r.amount)
            return (
              <div
                key={r.id}
                className={`flex items-center gap-3 px-3.5 py-3 ${
                  i > 0 ? 'border-t border-border' : ''
                } ${r.archived ? 'opacity-60' : ''}`}
              >
                <button
                  onClick={() => setView({ rule: r })}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Repeat size={16} className="flex-none text-dim" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">
                      {r.note || (r.type === 'income' ? 'Income' : 'Expense')}
                      {r.archived && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-warn">
                          Paused
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-dim">
                      {describeSchedule(r)} · {acctName(r.accountId)} · {r.autoPost ? 'Auto' : 'Manual'}
                    </p>
                    <p className="truncate text-xs text-dim">Next {dateLabel(r.nextRunDate)}</p>
                  </div>
                  <span
                    className={`flex-none font-display text-sm font-bold tabular-nums ${
                      r.type === 'income' ? 'text-pos' : 'text-neg'
                    }`}
                  >
                    {formatSignedPHP(signed)}
                  </span>
                </button>
                <button
                  onClick={() => archiveRecurring(r.id, !r.archived)}
                  aria-label={r.archived ? 'Resume' : 'Pause'}
                  className="flex-none rounded-pill p-1.5 text-muted hover:text-text"
                >
                  {r.archived ? <Play size={15} /> : <Pause size={15} />}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
