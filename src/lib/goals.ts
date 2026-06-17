// Pure goal math. `saved` comes from balances.goalProgress (linked-account
// balance or Σ goalId-tagged txns); this turns target + saved into a status.

export interface GoalStats {
  saved: number
  target: number
  remaining: number // clamped at 0
  pct: number // 0..100, clamped
  complete: boolean
}

export function goalStats(target: number, saved: number): GoalStats {
  const remaining = Math.max(0, target - saved)
  const pct = target > 0 ? Math.min(100, Math.max(0, (saved / target) * 100)) : saved > 0 ? 100 : 0
  return { saved, target, remaining, pct, complete: saved >= target && target > 0 }
}

/**
 * Estimate months to reach the goal at a given monthly contribution rate.
 * Returns null when there's nothing left, or the rate is non-positive.
 */
export function monthsToGoal(remaining: number, monthlyRate: number): number | null {
  if (remaining <= 0) return 0
  if (monthlyRate <= 0) return null
  return Math.ceil(remaining / monthlyRate)
}

const MS_PER_MONTH = (365.25 / 12) * 24 * 60 * 60 * 1000

/**
 * Average monthly contribution given total saved and the timestamp of the first
 * contribution. Falls back to `saved` when the window is under a month.
 */
export function monthlyRate(saved: number, firstContributionMs: number, nowMs: number): number {
  if (saved <= 0) return 0
  const elapsed = Math.max(MS_PER_MONTH, nowMs - firstContributionMs)
  return saved / (elapsed / MS_PER_MONTH)
}
