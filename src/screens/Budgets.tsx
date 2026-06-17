import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useBudgets, useCategories, useTransactions } from '../hooks'
import { budgetSpent, monthKey } from '../lib/balances'
import { budgetStatus, rolloverCarry } from '../lib/budgets'
import { shiftMonth } from '../lib/dates'
import { formatPHP } from '../lib/money'
import type { Budget } from '../db/types'
import Modal from '../ui/Modal'
import MonthNav from '../components/MonthNav'
import BudgetForm from '../components/BudgetForm'
import { Button } from '../ui/form'
import { Eyebrow, EmptyState, ProgressBar, SectionTitle } from '../ui/common'

export default function Budgets() {
  const budgets = useBudgets()
  const categories = useCategories()
  const txns = useTransactions()
  const [month, setMonth] = useState(monthKey(Date.now()))
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Category'
  const catColor = (id: string) => categories.find((c) => c.id === id)?.color

  const rows = budgets.map((b) => {
    const spent = budgetSpent(b, txns, month)
    const carry = b.rollover
      ? rolloverCarry(b.amount, budgetSpent(b, txns, shiftMonth(month, -1)))
      : 0
    return { budget: b, status: budgetStatus(b.amount, spent, carry) }
  })

  const totalLimit = rows.reduce((s, r) => s + r.status.limit, 0)
  const totalSpent = rows.reduce((s, r) => s + r.status.spent, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <SectionTitle>Budgets</SectionTitle>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      <MonthNav monthKey={month} onChange={setMonth} />

      {rows.length === 0 ? (
        <EmptyState
          title="No budgets yet"
          hint="Set a monthly limit on a category to track your spending against it."
          action={<Button onClick={() => setAdding(true)}>Set a budget</Button>}
        />
      ) : (
        <>
          <div className="rounded-card border border-border bg-surface p-4">
            <Eyebrow>This month</Eyebrow>
            <p className="font-display text-2xl font-bold tracking-tight">
              {formatPHP(totalSpent)}{' '}
              <span className="text-base font-medium text-dim">/ {formatPHP(totalLimit)}</span>
            </p>
          </div>

          <div className="space-y-2.5">
            {rows.map(({ budget, status }) => (
              <button
                key={budget.id}
                onClick={() => setEditing(budget)}
                className="block w-full rounded-card border border-border bg-surface p-3.5 text-left"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: catColor(budget.categoryId) || 'var(--text-dim)' }}
                    />
                    {catName(budget.categoryId)}
                    {budget.rollover && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-dim">
                        rollover
                      </span>
                    )}
                  </span>
                  <span
                    className={`font-display text-sm font-bold ${
                      status.level === 'over' ? 'text-neg' : 'text-text'
                    }`}
                  >
                    {formatPHP(status.spent)}
                    <span className="font-medium text-dim"> / {formatPHP(status.limit)}</span>
                  </span>
                </div>
                <ProgressBar pct={status.pct} level={status.level} />
                <p className="mt-1.5 text-xs text-muted">
                  {status.remaining >= 0
                    ? `${formatPHP(status.remaining)} left`
                    : `${formatPHP(-status.remaining)} over`}
                </p>
              </button>
            ))}
          </div>
        </>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add budget">
        <BudgetForm
          categories={categories}
          takenCategoryIds={budgets.map((b) => b.categoryId)}
          onDone={() => setAdding(false)}
        />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit budget">
        {editing && (
          <BudgetForm
            budget={editing}
            categories={categories}
            takenCategoryIds={budgets.map((b) => b.categoryId)}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  )
}
