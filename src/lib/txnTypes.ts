// Pure transaction-type semantics shared by UI. No Dexie/React import.

import type { TransactionType } from '../db/types'

/**
 * Whether the generic Add/Edit transaction sheet can represent a given type.
 * A `goal` earmark is a virtual row created and managed only from the Goals
 * screen (its `Mode` has no expense/income/category meaning), so it must not be
 * opened in the generic editor — doing so produces a blank, broken category UI.
 */
export function isSheetEditable(type: TransactionType): boolean {
  return type === 'expense' || type === 'income' || type === 'transfer' || type === 'adjustment'
}
