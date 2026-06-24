import { describe, it, expect } from 'vitest'
import {
  presentTypes,
  filterAccountsByType,
  TYPE_LABEL,
  homeViews,
  resolveHomeView,
  isAccountView,
  VIEW_LABEL,
} from './accounts'
import type { Account, AccountType } from '../db/types'

function acct(id: string, type: AccountType): Account {
  return {
    id,
    name: id,
    bank: id,
    type,
    currency: 'PHP',
    openingBalance: 0,
    archived: false,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('presentTypes', () => {
  it('returns only types with at least one account, in canonical order', () => {
    const accts = [acct('a', 'cash'), acct('b', 'ewallet'), acct('c', 'savings')]
    expect(presentTypes(accts)).toEqual(['ewallet', 'savings', 'cash'])
  })

  it('dedupes repeated types', () => {
    const accts = [acct('a', 'ewallet'), acct('b', 'ewallet')]
    expect(presentTypes(accts)).toEqual(['ewallet'])
  })

  it('ignores archived accounts', () => {
    const archived = { ...acct('a', 'credit'), archived: true }
    expect(presentTypes([archived])).toEqual([])
  })

  it('is empty for no accounts', () => {
    expect(presentTypes([])).toEqual([])
  })
})

describe('filterAccountsByType', () => {
  const accts = [acct('a', 'ewallet'), acct('b', 'savings'), acct('c', 'savings')]

  it('returns everything for "all"', () => {
    expect(filterAccountsByType(accts, 'all')).toHaveLength(3)
  })

  it('returns only accounts of the given type', () => {
    expect(filterAccountsByType(accts, 'savings').map((a) => a.id)).toEqual(['b', 'c'])
  })

  it('returns empty when no account has the type', () => {
    expect(filterAccountsByType(accts, 'credit')).toEqual([])
  })
})

describe('TYPE_LABEL', () => {
  it('has a human label for every account type', () => {
    const types: AccountType[] = ['ewallet', 'savings', 'checking', 'credit', 'cash', 'investment']
    for (const t of types) expect(TYPE_LABEL[t]).toBeTruthy()
  })
})

describe('homeViews', () => {
  it('is All + present types + Goals + Budget, in order', () => {
    const accts = [acct('a', 'cash'), acct('b', 'ewallet')]
    expect(homeViews(accts)).toEqual(['all', 'ewallet', 'cash', 'goals', 'budget'])
  })

  it('still offers All/Goals/Budget with no accounts', () => {
    expect(homeViews([])).toEqual(['all', 'goals', 'budget'])
  })

  it('has a label for every view it can emit', () => {
    for (const v of homeViews([acct('a', 'savings')])) expect(VIEW_LABEL[v]).toBeTruthy()
  })
})

describe('resolveHomeView', () => {
  const accts = [acct('a', 'ewallet')]

  it('keeps a stored view that is still available', () => {
    expect(resolveHomeView('budget', accts)).toBe('budget')
    expect(resolveHomeView('ewallet', accts)).toBe('ewallet')
  })

  it('falls back to all for a type whose accounts are gone', () => {
    expect(resolveHomeView('savings', accts)).toBe('all')
  })

  it('falls back to all for null / junk', () => {
    expect(resolveHomeView(null, accts)).toBe('all')
    expect(resolveHomeView('nonsense', accts)).toBe('all')
  })
})

describe('isAccountView', () => {
  it('is true for all + concrete types, false for goals/budget', () => {
    expect(isAccountView('all')).toBe(true)
    expect(isAccountView('savings')).toBe(true)
    expect(isAccountView('goals')).toBe(false)
    expect(isAccountView('budget')).toBe(false)
  })
})
