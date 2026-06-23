import { Link } from 'react-router-dom'
import type { Account, Goal, Transaction } from '../db/types'
import { goalProgress } from '../lib/balances'
import { goalStats } from '../lib/goals'
import { formatCompactPHP, formatPHP, maskPHP } from '../lib/money'
import { useHiddenBalances } from '../hooks'
import GoalRing from './GoalRing'

/**
 * Compact dashboard goal row: a small GoalRing + name + "saved / target", with
 * "· Tracks {account}" for linked goals. The whole row taps through to /goals.
 * Mirrors AccountTile so the Goals section reads like the Accounts section.
 * The per-goal brand `color` is the one allowed inline exception to tokens.
 */
export default function GoalRow({
  goal,
  accounts,
  txns,
}: {
  goal: Goal
  accounts: Account[]
  txns: Transaction[]
}) {
  const [hidden] = useHiddenBalances()
  const saved = goalProgress(goal, txns, accounts)
  const { pct } = goalStats(goal.targetAmount, saved)
  const linked = goal.linkedAccountId
    ? accounts.find((a) => a.id === goal.linkedAccountId)
    : undefined

  return (
    <Link
      to="/goals"
      className="flex items-center gap-3 rounded-card border border-border bg-surface p-3.5"
    >
      <GoalRing percent={pct} size={40} color={goal.color || 'var(--accent)'} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-text">{goal.name}</p>
        <p className="mt-0.5 truncate text-xs">
          <span className="font-display font-bold text-text" title={hidden ? undefined : formatPHP(saved)}>
            {hidden ? maskPHP(saved, true) : formatCompactPHP(saved)}
          </span>
          <span className="text-muted">
            {' '}
            / {hidden ? maskPHP(goal.targetAmount, true) : formatCompactPHP(goal.targetAmount)}
          </span>
          {linked && <span className="text-muted"> · Tracks {linked.name}</span>}
        </p>
      </div>
    </Link>
  )
}
