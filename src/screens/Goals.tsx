import { useState } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { useAccounts, useGoals, useTransactions } from '../hooks'
import { goalProgress } from '../lib/balances'
import { goalStats, monthlyRate, monthsToGoal } from '../lib/goals'
import { formatPHP, parseMajorInput } from '../lib/money'
import { toDateInput, fromDateInput } from '../lib/dates'
import { contributeToGoal } from '../db/repo'
import type { Goal } from '../db/types'
import Modal from '../ui/Modal'
import GoalRing from '../components/GoalRing'
import GoalForm from '../components/GoalForm'
import { Button, Field, Input, Select } from '../ui/form'
import { EmptyState, SectionTitle } from '../ui/common'

export default function Goals() {
  const goals = useGoals()
  const accounts = useAccounts()
  const txns = useTransactions()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [contributeTo, setContributeTo] = useState<Goal | null>(null)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <SectionTitle>Goals</SectionTitle>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {goals.length === 0 ? (
        <EmptyState
          title="No goals yet"
          hint="Save toward an emergency fund, a trip, or a new phone — track progress here."
          action={<Button onClick={() => setAdding(true)}>Add a goal</Button>}
        />
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => {
            const saved = goalProgress(goal, txns, accounts)
            const stats = goalStats(goal.targetAmount, saved)
            const linked = goal.linkedAccountId
              ? accounts.find((a) => a.id === goal.linkedAccountId)
              : undefined

            // ETA from contribution history (manual goals only).
            const contribs = txns.filter((t) => t.goalId === goal.id)
            const first = contribs.length
              ? Math.min(...contribs.map((t) => t.date))
              : Date.now()
            const rate = monthlyRate(saved, first, Date.now())
            const eta = linked ? null : monthsToGoal(stats.remaining, rate)

            return (
              <div key={goal.id} className="rounded-card border border-border bg-surface p-4">
                <div className="flex items-center gap-4">
                  <GoalRing percent={stats.pct} color={goal.color || 'var(--accent)'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-display text-base font-bold">{goal.name}</p>
                      <button
                        onClick={() => setEditing(goal)}
                        aria-label={`Edit ${goal.name}`}
                        className="text-dim hover:text-text"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                    <p className="mt-0.5 text-sm">
                      <span className="font-display font-bold">{formatPHP(saved)}</span>
                      <span className="text-dim"> / {formatPHP(goal.targetAmount)}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {stats.complete
                        ? '🎉 Goal reached'
                        : linked
                          ? `Tracks ${linked.name}`
                          : eta != null
                            ? `~${eta} month${eta === 1 ? '' : 's'} left`
                            : `${formatPHP(stats.remaining)} to go`}
                      {goal.targetDate
                        ? ` · by ${new Date(goal.targetDate).toLocaleDateString('en-US', {
                            month: 'short',
                            year: 'numeric',
                          })}`
                        : ''}
                    </p>
                  </div>
                </div>
                {!linked && !stats.complete && (
                  <Button
                    variant="ghost"
                    className="mt-3 w-full"
                    onClick={() => setContributeTo(goal)}
                  >
                    Contribute
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add goal">
        <GoalForm accounts={accounts} onDone={() => setAdding(false)} />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit goal">
        {editing && <GoalForm goal={editing} accounts={accounts} onDone={() => setEditing(null)} />}
      </Modal>

      <ContributeModal goal={contributeTo} onClose={() => setContributeTo(null)} />
    </div>
  )
}

function ContributeModal({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const accounts = useAccounts()
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [date, setDate] = useState(toDateInput(Date.now()))
  const [err, setErr] = useState('')

  const submit = async () => {
    const minor = parseMajorInput(amount)
    if (minor === null || minor <= 0) return setErr('Enter an amount.')
    const acct = accountId || accounts[0]?.id
    if (!acct) return setErr('Add an account first.')
    await contributeToGoal({
      goalId: goal!.id,
      accountId: acct,
      amount: minor,
      date: fromDateInput(date),
      note: `Contribution to ${goal!.name}`,
    })
    setAmount('')
    setErr('')
    onClose()
  }

  return (
    <Modal open={!!goal} onClose={onClose} title={`Contribute to ${goal?.name ?? ''}`}>
      <div className="space-y-3">
        <Field label="Amount">
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
        </Field>
        <Field label="From account">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {err && <p className="text-sm text-neg">{err}</p>}
        <Button onClick={submit} className="w-full">
          Add contribution
        </Button>
      </div>
    </Modal>
  )
}
