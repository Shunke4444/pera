import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft,
  Pencil,
  Archive,
  ArchiveRestore,
  Plus,
  Scale,
} from 'lucide-react'
import { useAccount, useTransactions, useCategories } from '../hooks'
import { accountBalance } from '../lib/balances'
import { formatPHP, parseMajorInput } from '../lib/money'
import { archiveAccount, adjustBalance } from '../db/repo'
import type { Transaction } from '../db/types'
import Modal from '../ui/Modal'
import AccountForm from '../components/AccountForm'
import AddTransactionSheet from '../components/AddTransactionSheet'
import TransactionList from '../components/TransactionList'
import { Button, Field, Input } from '../ui/form'
import { Dot, Eyebrow, Loading } from '../ui/common'

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
  const [addOpen, setAddOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [editTxn, setEditTxn] = useState<Transaction | undefined>()

  if (account === undefined) {
    return <Loading label="Loading account…" />
  }

  if (account === null) {
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
        <Button onClick={() => setAddOpen(true)}>
          <span className="inline-flex items-center gap-1.5">
            <Plus size={14} /> Add
          </span>
        </Button>
        <Button variant="ghost" onClick={() => setAdjustOpen(true)}>
          <span className="inline-flex items-center gap-1.5">
            <Scale size={14} /> Adjust
          </span>
        </Button>
        <Button variant="ghost" onClick={() => setEditOpen(true)}>
          <span className="inline-flex items-center gap-1.5">
            <Pencil size={14} /> Edit
          </span>
        </Button>
        <Button variant="ghost" onClick={() => archiveAccount(account.id, !account.archived)}>
          <span className="inline-flex items-center gap-1.5">
            {account.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            {account.archived ? 'Unarchive' : 'Archive'}
          </span>
        </Button>
      </div>

      <section className="space-y-2">
        <Eyebrow>Transactions</Eyebrow>
        <TransactionList
          txns={txns}
          categories={categories}
          emptyHint="No transactions on this account yet."
          onRowClick={(t) => setEditTxn(t)}
        />
      </section>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit account">
        <AccountForm account={account} onDone={() => setEditOpen(false)} />
      </Modal>

      <AddTransactionSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultAccountId={account.id}
      />

      <AddTransactionSheet
        open={!!editTxn}
        onClose={() => setEditTxn(undefined)}
        editTxn={editTxn}
      />

      <AdjustBalanceModal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        accountId={account.id}
        currentBalance={bal}
      />
    </div>
  )
}

function AdjustBalanceModal({
  open,
  onClose,
  accountId,
  currentBalance,
}: {
  open: boolean
  onClose: () => void
  accountId: string
  currentBalance: number
}) {
  const [value, setValue] = useState('')
  const [err, setErr] = useState('')

  const submit = async () => {
    const minor = parseMajorInput(value)
    if (minor === null) {
      setErr('Enter the real balance.')
      return
    }
    await adjustBalance(accountId, minor)
    setValue('')
    setErr('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Adjust balance">
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Computed balance is <span className="text-text">{formatPHP(currentBalance)}</span>. Enter
          the real balance — we record the difference as an adjustment, without editing history.
        </p>
        <Field label="Real balance">
          <Input
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
        </Field>
        {err && <p className="text-sm text-neg">{err}</p>}
        <div className="flex gap-2">
          <Button onClick={submit} className="flex-1">
            Reconcile
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
