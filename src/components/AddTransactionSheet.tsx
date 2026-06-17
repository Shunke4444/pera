import { useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import { Button, Field, Input, Select } from '../ui/form'
import { useAccounts, useCategories } from '../hooks'
import { addTransaction } from '../db/repo'
import { parseMajorInput } from '../lib/money'
import { toDateInput, fromDateInput } from '../lib/dates'

type Kind = 'expense' | 'income'

export default function AddTransactionSheet({
  open,
  onClose,
  defaultAccountId,
}: {
  open: boolean
  onClose: () => void
  defaultAccountId?: string
}) {
  const accounts = useAccounts()
  const categories = useCategories()

  const [kind, setKind] = useState<Kind>('expense')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(toDateInput(Date.now()))
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  // Default the account once data + sheet are ready.
  useEffect(() => {
    if (open && !accountId) {
      setAccountId(defaultAccountId ?? accounts[0]?.id ?? '')
    }
  }, [open, accounts, defaultAccountId, accountId])

  const cats = categories.filter((c) => c.kind === kind)

  const reset = () => {
    setKind('expense')
    setAmount('')
    setCategoryId('')
    setDate(toDateInput(Date.now()))
    setNote('')
    setErr('')
    setAccountId('')
  }

  const close = () => {
    reset()
    onClose()
  }

  const save = async () => {
    const minor = parseMajorInput(amount)
    if (minor === null || minor <= 0) {
      setErr('Enter an amount greater than zero.')
      return
    }
    if (!accountId) {
      setErr('Pick an account.')
      return
    }
    await addTransaction({
      accountId,
      amount: kind === 'expense' ? -minor : minor,
      type: kind,
      categoryId: categoryId || undefined,
      date: fromDateInput(date),
      note: note.trim() || undefined,
    })
    close()
  }

  return (
    <Modal open={open} onClose={close} title="Add transaction">
      {accounts.length === 0 ? (
        <p className="text-sm text-muted">Add an account first, then record transactions.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(['expense', 'income'] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k)
                  setCategoryId('')
                }}
                className={`rounded-tile border px-3 py-2 text-sm font-semibold capitalize ${
                  kind === k
                    ? k === 'expense'
                      ? 'border-neg text-neg'
                      : 'border-pos text-pos'
                    : 'border-border text-muted'
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          <Field label="Amount">
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </Field>

          <Field label="Account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Category">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— Uncategorized —</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Note">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </Field>
          </div>

          {err && <p className="text-sm text-neg">{err}</p>}

          <div className="flex gap-2 pt-1">
            <Button onClick={save} className="flex-1">
              Save
            </Button>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
