// Pure parser for the /quick-add deep-link query string. No React, no Dexie —
// so it's unit-testable and reusable by the native widget's deep link
// (/#/quick-add?type=expense). HashRouter's useLocation().search yields the
// "?...": this turns it into normalized prefill values.

export type QuickAddType = 'expense' | 'income'

export interface QuickAddParams {
  type: QuickAddType
  amount?: string // raw major-unit text, fed straight into the amount input
  account?: string // account id
  category?: string // category name
  note?: string
}

/** Trim, and treat empty as absent so callers see `undefined`, never "". */
function clean(v: string | null): string | undefined {
  const s = (v ?? '').trim()
  return s === '' ? undefined : s
}

/**
 * Parse a location.search string ("?type=income&amount=500") into quick-add
 * prefill values. Only `expense`/`income` are valid types; anything else (absent,
 * "transfer", garbage) falls back to `expense`. A bare "?" or "" is handled.
 */
export function parseQuickAddParams(search: string): QuickAddParams {
  const q = new URLSearchParams(search)
  const rawType = (q.get('type') ?? '').trim().toLowerCase()
  const type: QuickAddType = rawType === 'income' ? 'income' : 'expense'
  return {
    type,
    amount: clean(q.get('amount')),
    account: clean(q.get('account')),
    category: clean(q.get('category')),
    note: clean(q.get('note')),
  }
}
