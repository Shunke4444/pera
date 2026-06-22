import { describe, it, expect } from 'vitest'
import { isSheetEditable } from './txnTypes'
import type { TransactionType } from '../db/types'

describe('isSheetEditable', () => {
  it('allows the four generic transaction types the Add/Edit sheet can represent', () => {
    for (const t of ['expense', 'income', 'transfer', 'adjustment'] as TransactionType[]) {
      expect(isSheetEditable(t)).toBe(true)
    }
  })

  it('blocks goal earmarks — they are created/managed only from the Goals screen', () => {
    expect(isSheetEditable('goal')).toBe(false)
  })
})
