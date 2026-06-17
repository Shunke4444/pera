import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Pencil, Archive, ArchiveRestore } from 'lucide-react'
import { useAccount, useTransactions, useCategories } from '../hooks'
import { accountBalance } from '../lib/balances'
import { formatPHP } from '../lib/money'
import { archiveAccount } from '../db/repo'
import Modal from '../ui/Modal'
import AccountForm from '../components/AccountForm'
import TransactionList from '../components/TransactionList'
import { Button } from '../ui/form'
import { Dot, Eyebrow } from '../ui/common'

const TYPE_LABEL: Record<string, string> = {
  ewallet: 'E-wallet',
  savings: 'Savings',
  checking: 'Checking',
  credit: 'Credit',
  cash: 'Cash',
  investment: 'Investment',
}

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>()
  const account = useAccount(id)
  const txns = useTransactions(id)
  const categories = useCategories()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)

  if (!account) {
    return (
      <div className="py-12 text-center text-muted">
        <p>Account not found.</p>
        <button onClick={() => navigate('/')} className="mt-2 text-accent">
          Back to dashboard
        </button>
      </div>
    )
  }

  const bal = accountBalance(account, txns)

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate(-1)}
        className="-ml-1 inline-flex items-center text-sm text-muted hover:text-text"
      >
        <ChevronLeft size={18} /> Back
      </button>

      <section>
        <div className="flex items-center gap-2 text-sm text-muted">
          <Dot color={account.color} />
          {account.name}
          <span className="text-dim">· {TYPE_LABEL[account.type] ?? account.type}</span>
        </div>
        <p className="mt-1 font-display text-[34px] font-bold leading-none tracking-tight">
          {formatPHP(bal)}
        </p>
        {account.archived && (
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-warn">Archived</p>
        )}
        <p className="mt-1 text-xs text-dim">Opening balance {formatPHP(account.openingBalance)}</p>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => setEditOpen(true)}>
          <span className="inline-flex items-center gap-1.5">
            <Pencil size={14} /> Edit
          </span>
        </Button>
        <Button
          variant="ghost"
          onClick={() => archiveAccount(account.id, !account.archived)}
        >
          <span className="inline-flex items-center gap-1.5">
            {account.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            {account.archived ? 'Unarchive' : 'Archive'}
          </span>
        </Button>
      </div>

      <section className="space-y-2">
        <Eyebrow>Transactions</Eyebrow>
        <TransactionList txns={txns} categories={categories} emptyHint="No transactions on this account yet." />
      </section>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit account">
        <AccountForm account={account} onDone={() => setEditOpen(false)} />
      </Modal>
    </div>
  )
}
