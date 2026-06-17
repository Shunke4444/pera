import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAccounts, useTransactions, useNetWorth, useAssetsLiabilities } from '../hooks'
import { accountBalance } from '../lib/balances'
import { formatCompactPHP, formatPHP } from '../lib/money'
import type { Account } from '../db/types'
import Modal from '../ui/Modal'
import AccountForm from '../components/AccountForm'
import { Button } from '../ui/form'
import { Dot, Eyebrow, EmptyState, SectionTitle } from '../ui/common'

export default function Dashboard() {
  const accounts = useAccounts()
  const txns = useTransactions()
  const netWorth = useNetWorth()
  const { assets, liabilities } = useAssetsLiabilities()
  const [addOpen, setAddOpen] = useState(false)
  const navigate = useNavigate()

  // Preserve bank order by first appearance (accounts already sort-ordered).
  const groups: { bank: string; accounts: Account[] }[] = []
  for (const a of accounts) {
    let g = groups.find((x) => x.bank === a.bank)
    if (!g) {
      g = { bank: a.bank, accounts: [] }
      groups.push(g)
    }
    g.accounts.push(a)
  }

  return (
    <div className="space-y-6">
      <section>
        <Eyebrow>Net worth</Eyebrow>
        <p
          className="font-display text-[42px] font-bold leading-none tracking-tight"
          title={formatPHP(netWorth)}
        >
          {formatCompactPHP(netWorth)}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-tile border border-border bg-surface px-3 py-2">
            <Eyebrow>Assets</Eyebrow>
            <p className="font-display text-base font-bold text-pos">{formatCompactPHP(assets)}</p>
          </div>
          <div className="rounded-tile border border-border bg-surface px-3 py-2">
            <Eyebrow>Liabilities</Eyebrow>
            <p className="font-display text-base font-bold text-neg">
              {formatCompactPHP(liabilities)}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle>Accounts</SectionTitle>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {accounts.length === 0 ? (
          <EmptyState
            title="No accounts yet"
            hint="Add GCash, Maya, or any wallet to start tracking your net worth."
            action={<Button onClick={() => setAddOpen(true)}>Add your first account</Button>}
          />
        ) : (
          groups.map((g) => (
            <div key={g.bank} className="space-y-2">
              {groups.length > 1 && <Eyebrow>{g.bank}</Eyebrow>}
              <div className="grid grid-cols-2 gap-2.5">
                {g.accounts.map((a) => {
                  const bal = accountBalance(a, txns)
                  return (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/account/${a.id}`)}
                      className="rounded-card border border-border bg-surface p-3.5 text-left"
                    >
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <Dot color={a.color} />
                        <span className="truncate">{a.name}</span>
                      </div>
                      <p
                        className="mt-1.5 font-display text-lg font-bold tracking-tight"
                        title={formatPHP(bal)}
                      >
                        {formatCompactPHP(bal)}
                      </p>
                      {a.isIncomeSource && (
                        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                          Income source
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </section>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add account">
        <AccountForm onDone={() => setAddOpen(false)} />
      </Modal>
    </div>
  )
}
