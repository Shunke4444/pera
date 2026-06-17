export type AccountType = 'ewallet' | 'savings' | 'checking' | 'credit' | 'cash'

export interface SeedAccount {
  id: string
  name: string
  type: AccountType
  balance: number // PHP, whole pesos for this static starter
  color: string
  isIncomeSource?: boolean
}

// Replace this static seed with real Dexie data in build phase P2.
export const accounts: SeedAccount[] = [
  { id: 'gcash', name: 'GCash', type: 'ewallet', balance: 8920, color: '#3b82f6' },
  { id: 'maya', name: 'Maya', type: 'ewallet', balance: 5320, color: '#22c55e' },
  { id: 'maribank', name: 'Maribank', type: 'savings', balance: 42000, color: '#f97316' },
  { id: 'aub', name: 'AUB HelloMoney', type: 'savings', balance: 63500, color: '#14b8a6', isIncomeSource: true }
]

export const peso = (n: number): string =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n)
