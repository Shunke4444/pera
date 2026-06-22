import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import Modal from '../ui/Modal'
import { Button, Field, Input, Select } from '../ui/form'
import { useAccounts, useCategories } from '../hooks'
import {
  addTransaction,
  addTransfer,
  updateTransaction,
  updateTransfer,
  deleteTransaction,
  addCategory,
} from '../db/repo'
import { parseMajorInput, fromMinor } from '../lib/money'
import { toDateInput, fromDateInput } from '../lib/dates'
import { isSheetEditable } from '../lib/txnTypes'
import type { Transaction } from '../db/types'

type Mode = 'expense' | 'income' | 'transfer' | 'adjustment'

export default function AddTransactionSheet({
  open,
  onClose,
  defaultAccountId,
  editTxn,
}: {
  open: boolean
  onClose: () => void
  defaultAccountId?: string
  editTxn?: Transaction
}) {
  const accounts = useAccounts()
  const categories = useCategories()

  const [mode, setMode] = useState<Mode>('expense')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [date, setDate] = useState(toDateInput(Date.now()))
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  const editing = !!editTxn
  // A `goal` earmark can't be represented by the expense/income/transfer modes,
  // so it must not be opened in this generic editor (it would render a blank,
  // broken category UI). Block it with an explanation instead.
  const blocked = !!editTxn && !isSheetEditable(editTxn.type)

  // (Re)initialise whenever the sheet opens or the edit target changes.
  useEffect(() => {
    if (!open || blocked) return
    if (editTxn) {
      setMode(editTxn.type as Mode)
      setAmount(String(Math.abs(fromMinor(editTxn.amount))))
      setDate(toDateInput(editTxn.date))
      setNote(editTxn.note ?? '')
      setCategoryName(categories.find((c) => c.id === editTxn.categoryId)?.name ?? '')
      if (editTxn.type === 'transfer') {
        if (editTxn.amount < 0) {
          setAccountId(editTxn.accountId)
          setToAccountId(editTxn.transferAccountId ?? '')
        } else {
          setAccountId(editTxn.transferAccountId ?? '')
          setToAccountId(editTxn.accountId)
        }
      } else {
        setAccountId(editTxn.accountId)
      }
    } else {
      setMode('expense')
      setAmount('')
      setCategoryName('')
      setNote('')
      setDate(toDateInput(Date.now()))
      setAccountId(defaultAccountId ?? accounts[0]?.id ?? '')
      setToAccountId('')
    }
    setErr('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTxn])

  const close = () => {
    onClose()
  }

  const cats = categories.filter((c) => c.kind === (mode === 'income' ? 'income' : 'expense'))

  const save = async () => {
    const minor = parseMajorInput(amount)
    if (minor === null || minor <= 0) {
      setErr('Enter an amount greater than zero.')
      return
    }
    const ms = fromDateInput(date)

    try {
      if (mode === 'transfer') {
        if (!accountId || !toAccountId) return setErr('Pick both accounts.')
        if (accountId === toAccountId) return setErr('Transfer needs two different accounts.')
        if (editing && editTxn?.transferGroupId) {
          await updateTransfer(editTxn.transferGroupId, { amount: minor, date: ms, note })
        } else {
          await addTransfer({
            fromAccountId: accountId,
            toAccountId,
            amount: minor,
            date: ms,
            note: note.trim() || undefined,
          })
        }
        return close()
      }

      if (!accountId) return setErr('Pick an account.')

      if (mode === 'adjustment') {
        // Editing an existing adjustment only — keep its sign.
        const signed = editTxn && editTxn.amount < 0 ? -minor : minor
        await updateTransaction(editTxn!.id, {
          amount: signed,
          date: ms,
          note: note.trim() || undefined,
        })
        return close()
      }

      const signed = mode === 'expense' ? -minor : minor
      // Resolve the typed category name to an id, creating it on the fly when
      // it's new (addCategory dedups by name+kind, so an existing name reuses
      // its category). Empty name → uncategorized.
      const name = categoryName.trim()
      const categoryId = name
        ? await addCategory({ name, kind: mode === 'income' ? 'income' : 'expense' })
        : undefined
      if (editing) {
        await updateTransaction(editTxn!.id, {
          amount: signed,
          type: mode,
          accountId,
          categoryId,
          date: ms,
          note: note.trim() || undefined,
        })
      } else {
        await addTransaction({
          accountId,
          amount: signed,
          type: mode,
          categoryId,
          date: ms,
          note: note.trim() || undefined,
        })
      }
      close()
    } catch (e) {
      // Don't swallow a write failure or close the sheet — show it inline.
      setErr(`Couldn't save — ${e instanceof Error ? e.message : 'please try again.'}`)
    }
  }

  const remove = async () => {
    if (editTxn) await deleteTransaction(editTxn.id)
    close()
  }

  const title = editing ? 'Edit transaction' : 'Add transaction'
  const canModeSwitch = !editing

  return (
    <Modal open={open} onClose={close} title={blocked ? 'Goal contribution' : title}>
      {blocked ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            This is a goal contribution. Manage it from the goal on the Goals screen — it can’t be
            edited as a normal transaction.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Button variant="ghost" onClick={close} className="flex-1">
              Close
            </Button>
            <Button variant="danger" onClick={remove} aria-label="Delete contribution">
              <span className="inline-flex items-center gap-1.5">
                <Trash2 size={15} /> Delete
              </span>
            </Button>
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted">Add an account first, then record transactions.</p>
      ) : (
        <div className="space-y-3">
          {canModeSwitch && (
            <div className="grid grid-cols-3 gap-2">
              {(['expense', 'income', 'transfer'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m)
                    setCategoryName('')
                  }}
                  className={`rounded-tile border px-2 py-2 text-sm font-semibold capitalize ${
                    mode === m
                      ? m === 'expense'
                        ? 'border-neg text-neg'
                        : m === 'income'
                          ? 'border-pos text-pos'
                          : 'border-accent text-accent'
                      : 'border-border text-muted'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          <Field label="Amount">
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </Field>

          {mode === 'transfer' ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="From">
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="To">
                <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : (
            <Field label="Account">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {(mode === 'expense' || mode === 'income') && (
            <Field label="Category">
              <Input
                list="txn-category-options"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Pick one or type a new name"
                autoComplete="off"
              />
              <datalist id="txn-category-options">
                {cats.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Field label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Note">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </Field>
          </div>

          {err && <p className="text-sm text-neg">{err}</p>}

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={save} className="flex-1">
              {editing ? 'Save' : 'Add'}
            </Button>
            {editing && (
              <Button variant="danger" onClick={remove} aria-label="Delete transaction">
                <span className="inline-flex items-center gap-1.5">
                  <Trash2 size={15} /> Delete
                </span>
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
