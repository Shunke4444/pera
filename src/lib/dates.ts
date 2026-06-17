// Local-time date helpers. App stores epoch ms; UI works in "YYYY-MM-DD".

/** Midnight (local) of the given epoch ms. */
export function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** epoch ms → "YYYY-MM-DD" in local time (for <input type="date">). */
export function toDateInput(ms: number): string {
  const d = new Date(ms)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** "YYYY-MM-DD" (local) → epoch ms at local midnight. */
export function fromDateInput(s: string): number {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime()
}

/** "YYYY-MM" key → "June 2026". */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

/** "YYYY-MM" for a Date's local year/month. */
export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Shift a "YYYY-MM" key by n months (n may be negative). */
export function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, (m ?? 1) - 1 + n, 1)
  return monthKeyOf(d)
}

/** The last `count` month keys ending at `endKey`, oldest first. */
export function recentMonths(endKey: string, count: number): string[] {
  const out: string[] = []
  for (let i = count - 1; i >= 0; i--) out.push(shiftMonth(endKey, -i))
  return out
}

/** Epoch ms at the first instant of a "YYYY-MM" month (local). */
export function monthStartMs(key: string): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, 1).getTime()
}

/** Epoch ms at the last instant of a "YYYY-MM" month (local). */
export function monthEndMs(key: string): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m ?? 1, 1).getTime() - 1
}

/** "YYYY-MM" → "Jun" short label. */
export function monthShort(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString('en-US', { month: 'short' })
}
