import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import {
  useBudgets,
  useCategories,
  useHiddenBalances,
  useSettings,
  useTransactions,
} from '../hooks'
import { budgetSpent, monthKey, overallSpent } from '../lib/balances'
import { budgetStatus, projectedMonthEnd, rolloverCarry } from '../lib/budgets'
import { budgetBreakdown } from '../lib/insights'
import { shiftMonth } from '../lib/dates'
import { maskPHP } from '../lib/money'
import type { Budget, Category } from '../db/types'
import Modal from '../ui/Modal'
import BudgetForm from './BudgetForm'
import MonthlyBudgetForm from './MonthlyBudgetForm'
import { Dot, Eyebrow, EmptyState, ProgressBar } from '../ui/common'

/**
 * The monthly-budget summary: the headline cap card (or a "set budget" CTA)
 * plus the per-category "where it's going" breakdown, with inline editing.
 * Self-contained (reads its own live data) so it can be dropped on both the
 * Budgets screen and the home's Budget chip without prop-threading.
 */
export default function BudgetSummary({ month }: { month: string }) {
  const settings = useSettings()
  const budgets = useBudgets()
  const categories = useCategories()
  const txns = useTransactions()
  const [hidden] = useHiddenBalances()
  const [editingMonthly, setEditingMonthly] = useState(false)
  const [capCategory, setCapCategory] = useState<Category | null>(null)
  const [addingCap, setAddingCap] = useState(false)

  const isCurrentMonth = month === monthKey(Date.now())
  const monthlyCap = settings?.monthlyBudget
  const spent = overallSpent(txns, month)
  const monthStatus = monthlyCap != null ? budgetStatus(monthlyCap, spent) : null

  // Days left + projection only make sense for the in-progress (current) month.
  const nowMs = Date.now()
  const now = new Date(nowMs)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysLeft = daysInMonth - now.getDate()
  const projected = projectedMonthEnd(spent, nowMs)

  const budgetByCat = new Map(budgets.map((b) => [b.categoryId, b]))
  const slices = budgetBreakdown(txns, categories, budgets, month)

  // A capped category's status, factoring in optional rollover carry.
  const capStatus = (b: Budget, catSpent: number) => {
    const carry = b.rollover
      ? rolloverCarry(b.amount, budgetSpent(b, txns, shiftMonth(month, -1)))
      : 0
    return budgetStatus(b.amount, catSpent, carry)
  }

  const capsTotal = budgets.reduce((s, b) => s + b.amount, 0)
  const capsOverMonthly = monthlyCap != null && capsTotal > monthlyCap
  const editingCapBudget = capCategory ? budgetByCat.get(capCategory.id) : undefined

  return (
    <div className="space-y-5">
      {/* Monthly budget — the headline guardrail */}
      {monthStatus ? (
        <button
          onClick={() => setEditingMonthly(true)}
          className="block w-full rounded-card border border-border bg-surface p-4 text-left"
        >
          <div className="flex items-center justify-between">
            <Eyebrow>Monthly budget</Eyebrow>
            <Pencil size={14} className="text-dim" />
          </div>
          <p className="mt-1 font-display text-2xl font-bold tracking-tight">
            {maskPHP(spent, hidden)}{' '}
            <span className="text-base font-medium text-dim">/ {maskPHP(monthlyCap!, hidden)}</span>
          </p>
          <div className="mt-3">
            <ProgressBar pct={monthStatus.pct} level={monthStatus.level} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>
              {monthStatus.remaining >= 0
                ? `${maskPHP(monthStatus.remaining, hidden)} left`
                : `${maskPHP(-monthStatus.remaining, hidden)} over`}
            </span>
            {isCurrentMonth && (
              <span>
                {daysLeft} day{daysLeft === 1 ? '' : 's'} left
              </span>
            )}
          </div>
          {isCurrentMonth && spent > 0 && (
            <p className="mt-1 text-xs text-dim">
              Projected month-end: {maskPHP(projected, hidden)}
            </p>
          )}
        </button>
      ) : (
        <button
          onClick={() => setEditingMonthly(true)}
          className="flex w-full items-center gap-3 rounded-card border border-dashed border-border bg-surface p-4 text-left"
        >
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-accent/15 text-accent">
            <Plus size={18} />
          </span>
          <span>
            <span className="block text-sm font-semibold">Set monthly budget</span>
            <span className="block text-xs text-muted">
              One cap on your total monthly spending.
            </span>
          </span>
        </button>
      )}

      {capsOverMonthly && (
        <p className="text-xs text-warn">
          Your category caps add up to {maskPHP(capsTotal, hidden)} — more than your{' '}
          {maskPHP(monthlyCap!, hidden)} monthly budget.
        </p>
      )}

      {/* Where it's going — every category with spend this month, biggest first */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <Eyebrow>Where it’s going</Eyebrow>
          <button
            onClick={() => setAddingCap(true)}
            className="inline-flex items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text"
          >
            <Plus size={14} /> Category cap
          </button>
        </div>
        {slices.length === 0 ? (
          <EmptyState
            title="Nothing spent yet"
            hint="Expenses you record this month show up here, broken down by category. Set a category cap to keep any one in check."
          />
        ) : (
          slices.map((slice) => {
            const cat = categories.find((c) => c.id === slice.categoryId)
            const budget = cat ? budgetByCat.get(cat.id) : undefined
            const status = budget ? capStatus(budget, slice.total) : null
            const pctOfTotal = spent > 0 ? Math.round((slice.total / spent) * 100) : 0
            const clickable = !!cat
            const common = 'block w-full rounded-card border border-border bg-surface p-3.5 text-left'

            const body = (
              <>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Dot color={slice.color} />
                    {slice.name}
                  </span>
                  <span
                    className={`font-display text-sm font-bold ${
                      status?.level === 'over' ? 'text-neg' : 'text-text'
                    }`}
                  >
                    {maskPHP(slice.total, hidden)}
                    {status && (
                      <span className="font-medium text-dim">
                        {' '}
                        / {maskPHP(status.limit, hidden)}
                      </span>
                    )}
                  </span>
                </div>
                {status && (
                  <div className="mt-2">
                    <ProgressBar pct={status.pct} level={status.level} />
                  </div>
                )}
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted">{pctOfTotal}% of spending</span>
                  {!status && clickable && (
                    <span className="font-semibold text-accent">Set budget</span>
                  )}
                </div>
              </>
            )

            return clickable ? (
              <button key={slice.categoryId} onClick={() => setCapCategory(cat!)} className={common}>
                {body}
              </button>
            ) : (
              <div key={slice.categoryId} className={common}>
                {body}
              </div>
            )
          })
        )}
      </div>

      <Modal
        open={editingMonthly}
        onClose={() => setEditingMonthly(false)}
        title={monthlyCap != null ? 'Edit monthly budget' : 'Set monthly budget'}
      >
        <MonthlyBudgetForm current={monthlyCap} onDone={() => setEditingMonthly(false)} />
      </Modal>

      <Modal
        open={!!capCategory}
        onClose={() => setCapCategory(null)}
        title={
          editingCapBudget ? `Edit ${capCategory?.name} budget` : `Set ${capCategory?.name} budget`
        }
      >
        {capCategory && (
          <BudgetForm
            budget={editingCapBudget}
            categories={[capCategory]}
            takenCategoryIds={[]}
            onDone={() => setCapCategory(null)}
          />
        )}
      </Modal>

      <Modal open={addingCap} onClose={() => setAddingCap(false)} title="Add category cap">
        <BudgetForm
          categories={categories}
          takenCategoryIds={budgets.map((b) => b.categoryId)}
          onDone={() => setAddingCap(false)}
        />
      </Modal>
    </div>
  )
}
