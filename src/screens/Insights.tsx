import { useState } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { useAccounts, useBudgets, useCategories, useTransactions } from '../hooks'
import {
  spendingByCategory,
  incomeExpenseByMonth,
  netWorthSeries,
} from '../lib/insights'
import { budgetSpent, monthKey } from '../lib/balances'
import { budgetStatus } from '../lib/budgets'
import { formatPHP, fromMinor } from '../lib/money'
import { monthShort, recentMonths } from '../lib/dates'
import MonthNav from '../components/MonthNav'
import { Eyebrow, EmptyState, ProgressBar, SectionTitle } from '../ui/common'

const tickPHP = (v: number) => {
  const m = fromMinor(v)
  if (Math.abs(m) >= 1000) return `₱${Math.round(m / 1000)}k`
  return `₱${Math.round(m)}`
}

export default function Insights() {
  const accounts = useAccounts()
  const categories = useCategories()
  const budgets = useBudgets()
  const txns = useTransactions()
  const [month, setMonth] = useState(monthKey(Date.now()))

  const slices = spendingByCategory(txns, categories, month)
  const sliceTotal = slices.reduce((s, x) => s + x.total, 0)
  const months = recentMonths(month, 6)
  const flow = incomeExpenseByMonth(txns, months).map((f) => ({
    ...f,
    label: monthShort(f.month),
  }))
  const nw = netWorthSeries(accounts, txns, months).map((p) => ({
    ...p,
    label: monthShort(p.month),
  }))

  const budgetRows = budgets.map((b) => {
    const spent = budgetSpent(b, txns, month)
    return { b, status: budgetStatus(b.amount, spent) }
  })

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Category'

  return (
    <div className="space-y-6">
      <SectionTitle>Insights</SectionTitle>

      <MonthNav monthKey={month} onChange={setMonth} />

      {/* Spending by category */}
      <section className="space-y-3 rounded-card border border-border bg-surface p-4">
        <Eyebrow>Spending by category</Eyebrow>
        {slices.length === 0 ? (
          <EmptyState title="No spending" hint="No expenses recorded this month." />
        ) : (
          <>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="total"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="85%"
                    stroke="var(--surface)"
                    strokeWidth={2}
                  >
                    {slices.map((s) => (
                      <Cell key={s.categoryId} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, n) => [formatPHP(v), n as string]}
                    contentStyle={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      color: 'var(--text)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Labeled legend — never color-only */}
            <ul className="space-y-1.5">
              {slices.map((s) => (
                <li key={s.categoryId} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: s.color }}
                  />
                  <span className="flex-1 truncate text-text">{s.name}</span>
                  <span className="text-dim">
                    {sliceTotal > 0 ? Math.round((s.total / sliceTotal) * 100) : 0}%
                  </span>
                  <span className="font-display font-bold tabular-nums">{formatPHP(s.total)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Net worth over time */}
      <section className="space-y-3 rounded-card border border-border bg-surface p-4">
        <Eyebrow>Net worth over time</Eyebrow>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={nw} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={tickPHP}
                tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                formatter={(v: number) => [formatPHP(v), 'Net worth']}
                contentStyle={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  color: 'var(--text)',
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--accent)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: 'var(--accent)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Income vs expense */}
      <section className="space-y-3 rounded-card border border-border bg-surface p-4">
        <Eyebrow>Income vs expense</Eyebrow>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={flow} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={tickPHP}
                tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                formatter={(v: number, n) => [formatPHP(v), n as string]}
                contentStyle={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  color: 'var(--text)',
                }}
              />
              <Bar dataKey="income" name="Income" fill="var(--pos)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Expense" fill="var(--neg)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-pos" /> Income
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-neg" /> Expense
          </span>
        </div>
      </section>

      {/* Budget overview */}
      <section className="space-y-3 rounded-card border border-border bg-surface p-4">
        <Eyebrow>Budget overview</Eyebrow>
        {budgetRows.length === 0 ? (
          <p className="text-sm text-muted">No budgets set.</p>
        ) : (
          <div className="space-y-2.5">
            {budgetRows.map(({ b, status }) => (
              <div key={b.id}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-text">{catName(b.categoryId)}</span>
                  <span className="text-dim">
                    {formatPHP(status.spent)} / {formatPHP(status.limit)}
                  </span>
                </div>
                <ProgressBar pct={status.pct} level={status.level} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
