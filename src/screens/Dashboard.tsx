import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ShieldAlert, X, Eye, EyeOff, Repeat } from 'lucide-react'
import {
  useAccounts,
  useTransactions,
  useNetWorth,
  useAssetsLiabilities,
  useGoals,
  useSettings,
  useHiddenBalances,
  useRecurring,
} from '../hooks'
import { accountBalance, monthKey } from '../lib/balances'
import { shouldRemindBackup } from '../lib/backup'
import { formatCompactPHP, formatPHP, formatSignedPHP, maskPHP, MASK } from '../lib/money'
import { presentTypes, filterAccountsByType, TYPE_LABEL, type AccountFilter } from '../lib/accounts'
import { upcomingOccurrences } from '../lib/recurring'
import { postRecurringNow } from '../db/repo'
import type { Account } from '../db/types'
import Modal from '../ui/Modal'
import AccountForm from '../components/AccountForm'
import AccountTile from '../components/AccountTile'
import GoalRow from '../components/GoalRow'
import { Button } from '../ui/form'
import { Eyebrow, EmptyState, SectionTitle } from '../ui/common'

export default function Dashboard() {
  const accounts = useAccounts()
  const txns = useTransactions()
  const netWorth = useNetWorth()
  const { assets, liabilities } = useAssetsLiabilities()
  const goals = useGoals()
  const settings = useSettings()
  const recurring = useRecurring()
  const upcoming = upcomingOccurrences(recurring, Date.now(), 14).slice(0, 5)
  const [hidden, toggleHidden] = useHiddenBalances()
  const [addOpen, setAddOpen] = useState(false)
  const [storedFilter, setStoredFilter] = useState<AccountFilter>(
    () => (localStorage.getItem('pera-account-filter') as AccountFilter) || 'all',
  )
  const [hideReminder, setHideReminder] = useState(
    () => localStorage.getItem('pera-backup-dismissed') === new Date().toDateString(),
  )

  // Available type chips, and the effective filter (fall back to All if the
  // stored type no longer has any accounts).
  const types = presentTypes(accounts)
  const filter: AccountFilter =
    storedFilter !== 'all' && types.includes(storedFilter) ? storedFilter : 'all'
  const selectFilter = (f: AccountFilter) => {
    setStoredFilter(f)
    localStorage.setItem('pera-account-filter', f)
  }
  const shown = filterAccountsByType(accounts, filter)
  const filterSubtotal =
    filter === 'all' ? 0 : shown.reduce((s, a) => s + accountBalance(a, txns), 0)
  const thisMonth = monthKey(Date.now())
  const spentThisMonth = txns
    .filter((t) => t.type === 'expense' && monthKey(t.date) === thisMonth)
    .reduce((s, t) => s + Math.abs(t.amount), 0)
  const remind =
    !hideReminder && accounts.length > 0 && shouldRemindBackup(settings?.lastBackupAt, Date.now())

  const dismissReminder = () => {
    localStorage.setItem('pera-backup-dismissed', new Date().toDateString())
    setHideReminder(true)
  }

  // Preserve bank order by first appearance (accounts already sort-ordered).
  // Built from the filtered subset so the grid scopes to the selected type.
  const groups: { bank: string; accounts: Account[] }[] = []
  for (const a of shown) {
    let g = groups.find((x) => x.bank === a.bank)
    if (!g) {
      g = { bank: a.bank, accounts: [] }
      groups.push(g)
    }
    g.accounts.push(a)
  }

  // Render blocks, in order: a bank with ≥2 accounts becomes its own headed
  // group; lone accounts merge into a shared header-less 2-col grid (so 4
  // single-bank accounts read as one clean 2×2, matching the mock).
  type Block =
    | { kind: 'singles'; accounts: Account[] }
    | { kind: 'group'; bank: string; accounts: Account[] }
  const blocks: Block[] = []
  for (const g of groups) {
    if (g.accounts.length >= 2) {
      blocks.push({ kind: 'group', bank: g.bank, accounts: g.accounts })
    } else {
      const last = blocks[blocks.length - 1]
      if (last && last.kind === 'singles') last.accounts.push(...g.accounts)
      else blocks.push({ kind: 'singles', accounts: [...g.accounts] })
    }
  }

  return (
    <div className="space-y-6">
      {remind && (
        <div className="flex items-center gap-2.5 rounded-card border border-warn/40 bg-surface px-3.5 py-3">
          <ShieldAlert size={18} className="flex-none text-warn" />
          <Link to="/settings" className="flex-1 text-sm">
            <span className="font-medium">Back up your data</span>
            <span className="block text-xs text-muted">Export a copy so it can’t be lost.</span>
          </Link>
          <button onClick={dismissReminder} aria-label="Dismiss" className="text-dim hover:text-text">
            <X size={16} />
          </button>
        </div>
      )}

      <section>
        <div className="flex items-start justify-between">
          <Eyebrow>Net worth</Eyebrow>
          <button
            onClick={toggleHidden}
            aria-label={hidden ? 'Show balances' : 'Hide balances'}
            className="-mt-1 -mr-1 rounded-pill p-1.5 text-dim hover:text-text"
          >
            {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <p
          className="font-display text-[42px] font-bold leading-none tracking-tight"
          title={hidden ? undefined : formatPHP(netWorth)}
        >
          {hidden ? maskPHP(netWorth, true) : formatCompactPHP(netWorth)}
        </p>
        {/* Net worth already equals assets when nothing is owed — only split it
            out once a credit/loan account carries a balance (liabilities < 0). */}
        {liabilities < 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-tile border border-border bg-surface px-3 py-2">
              <Eyebrow>Assets</Eyebrow>
              <p className="font-display text-base font-bold text-pos">
                {hidden ? maskPHP(assets, true) : formatCompactPHP(assets)}
              </p>
            </div>
            <div className="rounded-tile border border-border bg-surface px-3 py-2">
              <Eyebrow>Liabilities</Eyebrow>
              <p className="font-display text-base font-bold text-neg">
                {hidden ? maskPHP(liabilities, true) : formatCompactPHP(liabilities)}
              </p>
            </div>
          </div>
        )}
      </section>

      {accounts.length > 0 && (
        <section className="-mt-2 space-y-1.5">
          <div className="flex gap-2 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(['all', ...types] as AccountFilter[]).map((t) => {
              const active = filter === t
              return (
                <button
                  key={t}
                  onClick={() => selectFilter(t)}
                  className={`flex-none rounded-pill px-3 py-1.5 text-xs font-semibold ${
                    active
                      ? 'bg-accent text-on-accent'
                      : 'border border-border text-muted hover:text-text'
                  }`}
                >
                  {t === 'all' ? 'All' : TYPE_LABEL[t]}
                </button>
              )
            })}
          </div>
          {filter !== 'all' && (
            <p className="text-xs text-muted">
              {TYPE_LABEL[filter]} ·{' '}
              <span className="font-display font-bold text-text">
                {maskPHP(filterSubtotal, hidden)}
              </span>
            </p>
          )}
        </section>
      )}

      {accounts.length > 0 && spentThisMonth > 0 && (
        <Link
          to="/insights"
          className="block rounded-card border border-border bg-surface p-3.5"
        >
          <Eyebrow>Spent this month</Eyebrow>
          <p className="mt-1 font-display text-lg font-bold tracking-tight text-neg">
            {hidden ? maskPHP(spentThisMonth, true) : formatCompactPHP(spentThisMonth)}
          </p>
        </Link>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Upcoming</SectionTitle>
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            {upcoming.map((u, i) => {
              const r = u.rule
              const signed = r.type === 'income' ? Math.abs(r.amount) : -Math.abs(r.amount)
              const when =
                u.inDays < 0
                  ? 'Overdue'
                  : u.inDays === 0
                    ? 'Today'
                    : `in ${u.inDays} day${u.inDays === 1 ? '' : 's'}`
              return (
                <div
                  key={`${r.id}-${u.date}`}
                  className={`flex items-center gap-3 px-3.5 py-2.5 ${
                    i > 0 ? 'border-t border-border' : ''
                  }`}
                >
                  <Repeat size={15} className="flex-none text-dim" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">
                      {r.note || (r.type === 'income' ? 'Income' : 'Expense')}
                    </p>
                    <p className={`text-xs ${u.inDays < 0 ? 'text-warn' : 'text-dim'}`}>{when}</p>
                  </div>
                  <span
                    className={`flex-none font-display text-sm font-bold tabular-nums ${
                      r.type === 'income' ? 'text-pos' : 'text-neg'
                    }`}
                  >
                    {hidden ? MASK : formatSignedPHP(signed)}
                  </span>
                  {r.autoPost ? (
                    <span className="flex-none text-[10px] font-semibold uppercase tracking-wider text-dim">
                      Auto
                    </span>
                  ) : (
                    <button
                      onClick={() => postRecurringNow(r.id)}
                      className="flex-none rounded-pill border border-border px-2.5 py-1 text-xs font-semibold text-muted hover:text-text"
                    >
                      Add
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle>Accounts</SectionTitle>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {accounts.length === 0 ? (
          <EmptyState
            title="No accounts yet"
            hint="Add GCash, Maya, or any wallet to start tracking your net worth."
            action={<Button onClick={() => setAddOpen(true)}>Add your first account</Button>}
          />
        ) : (
          blocks.map((b, i) =>
            b.kind === 'group' ? (
              <div key={`g-${b.bank}`} className="space-y-2">
                <Eyebrow>{b.bank}</Eyebrow>
                <div className="grid grid-cols-2 gap-2.5">
                  {b.accounts.map((a) => (
                    <AccountTile key={a.id} account={a} balance={accountBalance(a, txns)} />
                  ))}
                </div>
              </div>
            ) : (
              <div key={`s-${i}`} className="grid grid-cols-2 gap-2.5">
                {b.accounts.map((a) => (
                  <AccountTile key={a.id} account={a} balance={accountBalance(a, txns)} />
                ))}
              </div>
            ),
          )
        )}
      </section>

      {/* Goals live below accounts and mirror the Accounts section: up to 3 here,
          the rest behind "See all". New users add accounts first, so gate the
          whole section on having at least one account. */}
      {accounts.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle>Goals</SectionTitle>
            {goals.length > 0 && (
              <Link to="/goals" className="text-xs font-semibold text-accent hover:underline">
                See all
              </Link>
            )}
          </div>

          {goals.length === 0 ? (
            <Link
              to="/goals"
              className="grid place-items-center rounded-card border border-dashed border-border p-3.5 text-center text-xs text-muted"
            >
              + Add a savings goal
            </Link>
          ) : (
            <div className="space-y-2.5">
              {goals.slice(0, 3).map((goal) => (
                <GoalRow key={goal.id} goal={goal} accounts={accounts} txns={txns} />
              ))}
            </div>
          )}
        </section>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add account">
        <AccountForm onDone={() => setAddOpen(false)} />
      </Modal>
    </div>
  )
}
