import { describe, it, expect } from 'vitest'
import { parseQuickAddParams } from './quickAdd'

describe('parseQuickAddParams', () => {
  it('defaults to expense with no params', () => {
    expect(parseQuickAddParams('')).toEqual({
      type: 'expense',
      amount: undefined,
      account: undefined,
      category: undefined,
      note: undefined,
    })
  })

  it('handles a bare "?"', () => {
    expect(parseQuickAddParams('?').type).toBe('expense')
  })

  it('reads type=income', () => {
    expect(parseQuickAddParams('?type=income').type).toBe('income')
  })

  it('reads type=expense', () => {
    expect(parseQuickAddParams('?type=expense').type).toBe('expense')
  })

  it('is case-insensitive on type', () => {
    expect(parseQuickAddParams('?type=INCOME').type).toBe('income')
    expect(parseQuickAddParams('?type=Expense').type).toBe('expense')
  })

  it('falls back to expense for unknown/unsupported types', () => {
    expect(parseQuickAddParams('?type=transfer').type).toBe('expense')
    expect(parseQuickAddParams('?type=garbage').type).toBe('expense')
    expect(parseQuickAddParams('?type=').type).toBe('expense')
  })

  it('parses all prefill params together', () => {
    const p = parseQuickAddParams(
      '?type=income&amount=500&account=gcash&category=Salary&note=June',
    )
    expect(p).toEqual({
      type: 'income',
      amount: '500',
      account: 'gcash',
      category: 'Salary',
      note: 'June',
    })
  })

  it('url-decodes encoded values', () => {
    const p = parseQuickAddParams('?note=hi%20there&category=Food%20%26%20Drink')
    expect(p.note).toBe('hi there')
    expect(p.category).toBe('Food & Drink')
  })

  it('trims whitespace and drops empty values', () => {
    const p = parseQuickAddParams('?amount=%20%20&account=%20gcash%20&note=')
    expect(p.amount).toBeUndefined()
    expect(p.account).toBe('gcash')
    expect(p.note).toBeUndefined()
  })

  it('works without a leading "?"', () => {
    expect(parseQuickAddParams('type=income&amount=10')).toEqual({
      type: 'income',
      amount: '10',
      account: undefined,
      category: undefined,
      note: undefined,
    })
  })
})
