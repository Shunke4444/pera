import { useMemo, useState } from 'react'
import { Search, CheckSquare, X } from 'lucide-react'
import { useAccounts, useCategories, useTransactions } from '../hooks'
import { filterTransactions, type ActivityFilter } from '../lib/activity'
import { bulkRecategorize } from '../db/repo'
import type { Transaction, TransactionType } from '../db/types'
import TransactionList from '../components/TransactionList'
import AddTransactionSheet from '../components/AddTransactionSheet'
import { Input, Select, Button } from '../ui/form'
import { SectionTitle } from '../ui/common'

const TYPES: TransactionType[] = ['income', 'expense', 'transfer', 'adjustment']

export default function Activity() {
  const accounts = useAccounts()
  const categories = useCategories()
  const txns = useTransactions()

  const [filter, setFilter] = useState<ActivityFilter>({})
  const [search, setSearch] = useState('')
  const [bulk, setBulk] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [recat, setRecat] = useState('')
  const [editTxn, setEditTxn] = useState<Transaction | undefined>()

  const filtered = useMemo(
    () => filterTransactions(txns, { ...filter, search }, categories),
    [txns, filter, search, categories],
  )

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const applyRecat = async () => {
    if (!recat || selected.size === 0) return
    await bulkRecategorize([...selected], recat)
    setSelected(new Set())
    setRecat('')
    setBulk(false)
  }

  const set = (patch: Partial<ActivityFilter>) => setFilter((f) => ({ ...f, ...patch }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle>Activity</SectionTitle>
        <button
          onClick={() => {
            setBulk((b) => !b)
            setSelected(new Set())
          }}
          className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-semibold ${
            bulk ? 'border-accent text-accent' : 'border-border text-muted'
          }`}
        >
          {bulk ? <X size={14} /> : <CheckSquare size={14} />}
          {bulk ? 'Done' : 'Select'}
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes & categories"
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Select value={filter.accountId ?? ''} onChange={(e) => set({ accountId: e.target.value || undefined })}>
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select
          value={filter.type ?? ''}
          onChange={(e) => set({ type: (e.target.value || undefined) as TransactionType | undefined })}
        >
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t} className="capitalize">
              {t}
            </option>
          ))}
        </Select>
        <Select value={filter.categoryId ?? ''} onChange={(e) => set({ categoryId: e.target.value || undefined })}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {bulk && selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-card border border-accent/40 bg-surface-2 p-2.5">
          <span className="text-xs font-semibold text-muted">{selected.size} selected</span>
          <Select value={recat} onChange={(e) => setRecat(e.target.value)} className="flex-1 py-1.5">
            <option value="">Recategorize to…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Button onClick={applyRecat} className="py-1.5">
            Apply
          </Button>
        </div>
      )}

      <TransactionList
        txns={filtered}
        categories={categories}
        accounts={accounts}
        emptyHint="No transactions match these filters."
        onRowClick={bulk ? undefined : (t) => setEditTxn(t)}
        selectable={bulk}
        selected={selected}
        onToggle={toggle}
      />

      <AddTransactionSheet open={!!editTxn} onClose={() => setEditTxn(undefined)} editTxn={editTxn} />
    </div>
  )
}
