// Pure date logic for recurring rules. No Dexie / no clock — every function is
// total and deterministic so the schedule math is fully unit-testable.
import type { RecurringRule, RecurringFreq } from '../db/types'

const DAY = 86_400_000

/** Hard ceiling on how many occurrences a single call may emit, so a long-dormant
 *  app can never runaway-generate thousands of catch-up transactions. */
export const MAX_OCCURRENCES = 60

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** A valid local-midnight date for year/monthIndex/day, clamping the day to the
 *  month's length (so day 31 → Feb 28/29, Apr 30). Month index may overflow
 *  (e.g. 13) and is normalized into the following year. */
function clampedDate(year: number, monthIndex: number, day: number): number {
  const base = new Date(year, monthIndex, 1) // normalizes month/year overflow
  const y = base.getFullYear()
  const m = base.getMonth()
  const lastDay = new Date(y, m + 1, 0).getDate()
  return new Date(y, m, Math.min(day, lastDay)).getTime()
}

/**
 * The next occurrence on/after `from` for a rule of (`freq`, `interval`,
 * `anchor`). Used to seed a rule's first `nextRunDate` from its start date.
 *
 * - monthly: `anchor` is day-of-month, clamped to month length. Returns the
 *   anchor day in `from`'s month if it hasn't passed, else `interval` months on.
 * - yearly: like monthly but the month is taken from `from` and it steps whole
 *   years (so the rule recurs on `from`'s month/anchor each `interval` years).
 * - weekly: `anchor` is the weekday (0–6); returns the first such weekday on/
 *   after `from` (interval governs spacing between occurrences, see `dueDates`).
 */
export function nextDate(
  freq: RecurringFreq,
  interval: number,
  anchor: number,
  from: number,
): number {
  const step = Math.max(1, Math.floor(interval))
  const f = startOfDay(from)

  if (freq === 'weekly') {
    const target = ((anchor % 7) + 7) % 7
    const delta = (target - new Date(f).getDay() + 7) % 7
    return f + delta * DAY
  }

  const d = new Date(f)
  const monthsPerStep = freq === 'yearly' ? 12 * step : step
  const here = clampedDate(d.getFullYear(), d.getMonth(), anchor)
  if (here >= f) return here
  return clampedDate(d.getFullYear(), d.getMonth() + monthsPerStep, anchor)
}

/** Advance one occurrence to the next, keeping the original `anchor` (so a
 *  clamped month restores the anchor next time, e.g. Feb 28 → Mar 31). */
function advance(occurrence: number, freq: RecurringFreq, interval: number, anchor: number): number {
  const step = Math.max(1, Math.floor(interval))
  if (freq === 'weekly') return startOfDay(occurrence) + step * 7 * DAY
  const d = new Date(occurrence)
  const months = freq === 'yearly' ? 12 * step : step
  return clampedDate(d.getFullYear(), d.getMonth() + months, anchor)
}

/** The anchor to use: explicit `anchorDay`, else derived from `nextRunDate`. */
function resolveAnchor(rule: RecurringRule): number {
  if (rule.anchorDay != null) return rule.anchorDay
  const d = new Date(rule.nextRunDate)
  return rule.freq === 'weekly' ? d.getDay() : d.getDate()
}

export interface Upcoming {
  rule: RecurringRule
  date: number
  inDays: number // days from today; negative = overdue, 0 = today
}

/**
 * Flatten upcoming occurrences (auto + manual) within `windowDays` of `now`,
 * sorted soonest first, capped per rule. Overdue occurrences (date < today)
 * are included with a negative `inDays` so they surface too.
 */
export function upcomingOccurrences(
  rules: RecurringRule[],
  now: number,
  windowDays = 14,
  perRuleCap = 3,
): Upcoming[] {
  const today = startOfDay(now)
  const upTo = today + windowDays * DAY
  const items: Upcoming[] = []
  for (const rule of rules) {
    if (rule.archived) continue
    for (const date of dueDates(rule, upTo).slice(0, perRuleCap)) {
      items.push({ rule, date, inDays: Math.round((startOfDay(date) - today) / DAY) })
    }
  }
  return items.sort((a, b) => a.date - b.date)
}

/** The occurrence strictly after `occurrence` for this rule (used to advance
 *  `nextRunDate` once an occurrence has been posted). */
export function nextAfter(rule: RecurringRule, occurrence: number): number {
  return advance(startOfDay(occurrence), rule.freq, rule.interval, resolveAnchor(rule))
}

/**
 * Every occurrence from `nextRunDate` through `upTo` (inclusive), respecting
 * `endDate` and capped at `MAX_OCCURRENCES`. Returns `[]` when nothing is due.
 */
export function dueDates(rule: RecurringRule, upTo: number): number[] {
  const anchor = resolveAnchor(rule)
  const out: number[] = []
  let d = startOfDay(rule.nextRunDate)
  while (d <= upTo && out.length < MAX_OCCURRENCES) {
    if (rule.endDate != null && d > rule.endDate) break
    out.push(d)
    d = advance(d, rule.freq, rule.interval, anchor)
  }
  return out
}
