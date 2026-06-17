import type { Category, Transaction, TransactionType } from '../db/types'

export interface ActivityFilter {
  accountId?: string
  type?: TransactionType
  categoryId?: string
  search?: string
}

/**
 * Filter transactions by account/type/category and a free-text search over the
 * note and the category name. Pure so it can be unit-tested and reused.
 */
export function filterTransactions(
  txns: Transaction[],
  filter: ActivityFilter,
  categories: Category[],
): Transaction[] {
  const q = filter.search?.trim().toLowerCase()
  const catName = (id?: string) =>
    categories.find((c) => c.id === id)?.name.toLowerCase() ?? ''

  return txns.filter((t) => {
    if (filter.accountId && t.accountId !== filter.accountId) return false
    if (filter.type && t.type !== filter.type) return false
    if (filter.categoryId && t.categoryId !== filter.categoryId) return false
    if (q) {
      const hay = `${t.note ?? ''} ${catName(t.categoryId)} ${t.type}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
