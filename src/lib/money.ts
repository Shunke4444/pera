// Money lives as integer minor units (centavos). Never store floats.

const MINOR_PER_MAJOR = 100

/** Pesos (possibly fractional) → integer centavos. Rounds float artifacts. */
export function toMinor(major: number): number {
  return Math.round(major * MINOR_PER_MAJOR)
}

/** Integer centavos → pesos as a number (for the formatter only). */
export function fromMinor(minor: number): number {
  return minor / MINOR_PER_MAJOR
}

const phpFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})

/** Integer centavos → "₱1,234.50" via the locale formatter. */
export function formatPHP(minor: number): string {
  return phpFormatter.format(fromMinor(minor))
}

/** Same as formatPHP but always sign the amount: "+₱500.00" / "−₱500.00". */
export function formatSignedPHP(minor: number): string {
  const sign = minor > 0 ? '+' : minor < 0 ? '−' : ''
  return sign + formatPHP(Math.abs(minor))
}

const phpCompact = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  notation: 'compact',
  maximumFractionDigits: 1,
})

// ₱1,000,000.00 in minor units. At/above this we switch to compact notation so
// big figures never overflow a card/hero (FEATURE-BACKLOG B2).
const COMPACT_THRESHOLD = 100_000_000

/**
 * Centavos → readable peso string that never blows past ~10 chars. Small/medium
 * values keep full precision ("₱1,234.50"); ₱1M and above scale to "₱1.2M".
 */
export function formatCompactPHP(minor: number): string {
  if (Math.abs(minor) >= COMPACT_THRESHOLD) {
    return phpCompact.format(fromMinor(minor))
  }
  return formatPHP(minor)
}

/** Placeholder shown for any peso figure while balances are hidden. */
export const MASK = '₱ ••••'

/** formatPHP, or the privacy mask when `hidden` — one rule for every money site. */
export function maskPHP(minor: number, hidden: boolean): string {
  return hidden ? MASK : formatPHP(minor)
}

/**
 * Parse a user-typed amount in major units ("1,234.5", "₱99", "-50") into
 * integer minor units. Returns null for empty/garbage so callers can validate.
 */
export function parseMajorInput(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return toMinor(n)
}
