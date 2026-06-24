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
import {
  homeViews,
  resolveHomeView,
  isAccountView,
  filterAccountsByType,
  TYPE_LABEL,
  VIEW_LABEL,
  type HomeView,
} from '../lib/accounts'
import { upcomingOccurrences } from '../lib/recurring'
import { postRecurringNow } from '../db/repo'
import type { Account } from '../db/types'
import Modal from '../ui/Modal'
import AccountForm from '../components/AccountForm'
import AccountTile from '../components/AccountTile'
import GoalRow from '../components/GoalRow'
import GoalForm from '../components/GoalForm'
import BudgetSummary from '../components/BudgetSummary'
import MonthlyBudgetForm from '../components/MonthlyBudgetForm'
import RecurringManager from '../components/RecurringManager'
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

  // Modals, one per contextual "Add" affordance.
  const [addAccountOpen, setAddAccountOpen] = useState(false)
  const [addGoalOpen, setAddGoalOpen] = useState(false)
  const [editBudgetOpen, setEditBudgetOpen] = useState(false)
  const [recurringOpen, setRecurringOpen] = useState(false)

  const [storedView, setStoredView] = useState<string | null>(() =>
    localStorage.getItem('pera-home-view'),
  )
  const [hideReminder, setHideReminder] = useState(
    () => localStorage.getItem('pera-backup-dismissed') === new Date().toDateString(),
  )

  // Resolve the persisted chip against what's available (a type chip vanishes
  // when its last account is archived → fall back to All).
  const views = homeViews(accounts)
  const view = resolveHomeView(storedView, accounts)
  const selectView = (v: HomeView) => {
    setStoredView(v)
    localStorage.setItem('pera-home-view', v)
  }

  const shown = isAccountView(view) ? filterAccountsByType(accounts, view) : []
  const filterSubtotal =
    view !== 'all' && isAccountView(view)
      ? shown.reduce((s, a) => s + accountBalance(a, txns), 0)
      : 0

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

  // Group the visible accounts into render blocks: a bank with ≥2 accounts gets
  // its own headed group; lone accounts merge into a shared header-less 2-col
  // grid (so 4 single-bank accounts read as one clean 2×2).
  const groups: { bank: string; accounts: Account[] }[] = []
  for (const a of shown) {
    let g = groups.find((x) => x.bank === a.bank)
    if (!g) {
      g = { bank: a.bank, accounts: [] }
      groups.push(g)
    }
    g.accounts.push(a)
  }
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

  const monthlyCap = settings?.monthlyBudget

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

      {/* Net worth — pinned above the chip selector for every view. */}
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

      {/* The home's main selector. */}
      <section className="-mt-2">
        <div className="flex gap-2 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {views.map((v) => {
            const active = view === v
            return (
              <button
                key={v}
                onClick={() => selectView(v)}
                className={`flex-none rounded-pill px-3.5 py-1.5 text-xs font-semibold ${
                  active
                    ? 'bg-accent text-on-accent'
                    : 'border border-border text-muted hover:text-text'
                }`}
              >
                {VIEW_LABEL[v]}
              </button>
            )
          })}
        </div>
      </section>

      {/* ---- Account views (All / a single type) ---- */}
      {isAccountView(view) && (
        <>
          {view !== 'all' && accounts.length > 0 && (
            <p className="-mt-3 text-xs text-muted">
              {TYPE_LABEL[view]} ·{' '}
              <span className="font-display font-bold text-text">
                {maskPHP(filterSubtotal, hidden)}
              </span>
            </p>
          )}

          {view === 'all' && accounts.length > 0 && spentThisMonth > 0 && (
            <Link to="/insights" className="block rounded-card border border-border bg-surface p-4">
              <Eyebrow>Spent this month</Eyebrow>
              <p className="mt-1 font-display text-lg font-bold tracking-tight text-neg">
                {hidden ? maskPHP(spentThisMonth, true) : formatCompactPHP(spentThisMonth)}
              </p>
            </Link>
          )}

          {view === 'all' && upcoming.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <SectionTitle>Upcoming</SectionTitle>
                <button
                  onClick={() => setRecurringOpen(true)}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  Manage
                </button>
              </div>
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
                        <p className={`text-xs ${u.inDays < 0 ? 'text-warn' : 'text-dim'}`}>
                          {when}
                        </p>
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
                onClick={() => setAddAccountOpen(true)}
                className="inline-flex items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text"
              >
                <Plus size={14} /> Add account
              </button>
            </div>

            {accounts.length === 0 ? (
              <EmptyState
                title="No accounts yet"
                hint="Add GCash, Maya, or any wallet to start tracking your net worth."
                action={<Button onClick={() => setAddAccountOpen(true)}>Add your first account</Button>}
              />
            ) : shown.length === 0 ? (
              <EmptyState
                title={`No ${VIEW_LABEL[view].toLowerCase()} accounts`}
                hint="Add one, or switch back to All."
                action={<Button onClick={() => setAddAccountOpen(true)}>Add account</Button>}
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
        </>
      )}

      {/* ---- Goals view (was the bottom section) ---- */}
      {view === 'goals' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle>Goals</SectionTitle>
            <button
              onClick={() => setAddGoalOpen(true)}
              className="inline-flex items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text"
            >
              <Plus size={14} /> Add goal
            </button>
          </div>

          {goals.length === 0 ? (
            <EmptyState
              title="No goals yet"
              hint="Save toward an emergency fund, a trip, or a new phone — track progress here."
              action={<Button onClick={() => setAddGoalOpen(true)}>Add a goal</Button>}
            />
          ) : (
            <div className="space-y-2.5">
              {goals.map((goal) => (
                <GoalRow key={goal.id} goal={goal} accounts={accounts} txns={txns} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---- Budget view ---- */}
      {view === 'budget' && (
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <SectionTitle>Budget</SectionTitle>
            <button
              onClick={() => setEditBudgetOpen(true)}
              className="inline-flex items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text"
            >
              <Plus size={14} /> {monthlyCap != null ? 'Edit budget' : 'Set budget'}
            </button>
          </div>

          <BudgetSummary month={thisMonth} />

          <button
            onClick={() => setRecurringOpen(true)}
            className="flex w-full items-center justify-between rounded-card border border-border bg-surface px-3.5 py-3 text-sm font-medium"
          >
            <span className="inline-flex items-center gap-2">
              <Repeat size={15} className="text-muted" /> Recurring &amp; bills
            </span>
            <span className="text-xs text-dim">{recurring.length}</span>
          </button>
        </section>
      )}

      <Modal open={addAccountOpen} onClose={() => setAddAccountOpen(false)} title="Add account">
        <AccountForm onDone={() => setAddAccountOpen(false)} />
      </Modal>
      <Modal open={addGoalOpen} onClose={() => setAddGoalOpen(false)} title="Add goal">
        <GoalForm accounts={accounts} onDone={() => setAddGoalOpen(false)} />
      </Modal>
      <Modal
        open={editBudgetOpen}
        onClose={() => setEditBudgetOpen(false)}
        title={monthlyCap != null ? 'Edit monthly budget' : 'Set monthly budget'}
      >
        <MonthlyBudgetForm current={monthlyCap} onDone={() => setEditBudgetOpen(false)} />
      </Modal>
      <Modal
        open={recurringOpen}
        onClose={() => setRecurringOpen(false)}
        title="Recurring & upcoming"
      >
        <RecurringManager />
      </Modal>
    </div>
  )
}
