import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Archive, ArchiveRestore, Plus, Upload } from 'lucide-react'
import { useAllAccounts, useTransactions } from '../hooks'
import { accountBalance } from '../lib/balances'
import { formatPHP } from '../lib/money'
import { archiveAccount } from '../db/repo'
import type { Account } from '../db/types'
import Modal from '../ui/Modal'
import AccountForm from '../components/AccountForm'
import { Dot, Eyebrow, SectionTitle } from '../ui/common'

export default function Settings() {
  const accounts = useAllAccounts()
  const txns = useTransactions()
  const [editing, setEditing] = useState<Account | null>(null)
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-6">
      <SectionTitle>Settings</SectionTitle>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Eyebrow>Accounts</Eyebrow>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent"
          >
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {accounts.map((a, i) => (
            <div
              key={a.id}
              className={`flex items-center gap-3 px-3.5 py-3 ${
                i > 0 ? 'border-t border-border' : ''
              } ${a.archived ? 'opacity-60' : ''}`}
            >
              <Dot color={a.color} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {a.name}
                  {a.archived && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-warn">
                      Archived
                    </span>
                  )}
                </p>
                <p className="text-xs text-dim">{formatPHP(accountBalance(a, txns))}</p>
              </div>
              <button
                onClick={() => setEditing(a)}
                aria-label={`Edit ${a.name}`}
                className="rounded-pill p-1.5 text-muted hover:text-text"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => archiveAccount(a.id, !a.archived)}
                aria-label={a.archived ? `Unarchive ${a.name}` : `Archive ${a.name}`}
                className="rounded-pill p-1.5 text-muted hover:text-text"
              >
                {a.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <Eyebrow>Data</Eyebrow>
        <Link
          to="/import"
          className="flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-3 text-sm font-medium"
        >
          <Upload size={16} className="text-muted" /> Import statements
        </Link>
      </section>

      <section className="space-y-2">
        <Eyebrow>About</Eyebrow>
        <div className="rounded-card border border-border bg-surface px-3.5 py-3 text-sm text-muted">
          <p className="text-text">Pera</p>
          <p className="mt-1">
            Free, open-source, on-device money tracker. Your data never leaves this device.
          </p>
        </div>
      </section>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add account">
        <AccountForm onDone={() => setAdding(false)} />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit account">
        {editing && <AccountForm account={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}
