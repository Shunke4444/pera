// Pure budget math. Spending itself comes from balances.budgetSpent (which
// already excludes income/transfers/adjustments); this layer turns a limit +
// spent (+ optional rollover carry) into a display status.

export type BudgetLevel = 'ok' | 'warn' | 'over'

export interface BudgetStatus {
  limit: number // effective limit incl. rollover carry, minor units
  spent: number // minor units
  remaining: number // limit - spent (negative when over)
  pct: number // 0..(>100), spent / limit * 100
  level: BudgetLevel
}

/** <80% ok, 80–100% warn, >100% over. */
export function budgetLevel(pct: number): BudgetLevel {
  if (pct > 100) return 'over'
  if (pct >= 80) return 'warn'
  return 'ok'
}

/**
 * Roll unspent budget forward: only positive leftover carries (an overspent
 * prior month doesn't punish the next). carry = max(0, prevLimit - prevSpent).
 */
export function rolloverCarry(prevLimit: number, prevSpent: number): number {
  return Math.max(0, prevLimit - prevSpent)
}

export function budgetStatus(amount: number, spent: number, carry = 0): BudgetStatus {
  const limit = amount + carry
  const remaining = limit - spent
  const pct = limit > 0 ? (spent / limit) * 100 : spent > 0 ? Infinity : 0
  return { limit, spent, remaining, pct, level: budgetLevel(pct) }
}

/**
 * Linear month-end forecast: project the current spend pace across the whole
 * month (spent ÷ days-elapsed × days-in-month). `now` is epoch ms; the day of
 * the month is "days elapsed". Returns whole minor units.
 */
export function projectedMonthEnd(spent: number, now: number): number {
  const d = new Date(now)
  const daysElapsed = d.getDate()
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return Math.round((spent / daysElapsed) * daysInMonth)
}
