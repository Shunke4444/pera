import { useState } from 'react'
import type { Account, AccountType } from '../db/types'
import { addAccount, updateAccount } from '../db/repo'
import { fromMinor, parseMajorInput } from '../lib/money'
import { Button, Field, Input, Select } from '../ui/form'

const TYPES: { value: AccountType; label: string }[] = [
  { value: 'ewallet', label: 'E-wallet' },
  { value: 'savings', label: 'Savings' },
  { value: 'checking', label: 'Checking' },
  { value: 'credit', label: 'Credit' },
  { value: 'cash', label: 'Cash' },
  { value: 'investment', label: 'Investment' },
]

// Brand palette from STYLE.md + a couple of neutrals for custom accounts.
const COLORS = ['#3B82F6', '#22C55E', '#F97316', '#14B8A6', '#A855F7', '#EF4444', '#9AA0AA']

export default function AccountForm({
  account,
  onDone,
}: {
  account?: Account
  onDone: () => void
}) {
  const editing = !!account
  const [name, setName] = useState(account?.name ?? '')
  const [bank, setBank] = useState(account?.bank ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'ewallet')
  const [opening, setOpening] = useState(
    account ? String(fromMinor(account.openingBalance)) : '',
  )
  const [isIncome, setIsIncome] = useState(account?.isIncomeSource ?? false)
  const [color, setColor] = useState(account?.color ?? COLORS[0])
  const [err, setErr] = useState('')

  const save = async () => {
    if (!name.trim()) {
      setErr('Name is required.')
      return
    }
    const openingBalance = opening.trim() === '' ? 0 : parseMajorInput(opening)
    if (openingBalance === null) {
      setErr('Opening balance is not a valid amount.')
      return
    }
    try {
      if (editing) {
        await updateAccount(account!.id, {
          name: name.trim(),
          bank: bank.trim() || name.trim(),
          type,
          openingBalance,
          isIncomeSource: isIncome,
          color,
        })
      } else {
        await addAccount({
          name: name.trim(),
          bank: bank.trim() || name.trim(),
          type,
          openingBalance,
          isIncomeSource: isIncome,
          color,
        })
      }
      onDone()
    } catch (e) {
      setErr(`Couldn't save — ${e instanceof Error ? e.message : 'please try again.'}`)
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Account name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GCash" />
      </Field>
      <Field label="Bank / group">
        <Input
          value={bank}
          onChange={(e) => setBank(e.target.value)}
          placeholder="Defaults to the name"
        />
      </Field>
      <Field label="Type">
        <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={editing ? 'Opening balance' : 'Starting balance'}>
        <Input
          inputMode="decimal"
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
          placeholder="0.00"
        />
      </Field>

      <div>
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dim">
          Color
        </span>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full ${
                color === c ? 'ring-2 ring-offset-2 ring-offset-surface ring-text' : ''
              }`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 py-1 text-sm">
        <input
          type="checkbox"
          checked={isIncome}
          onChange={(e) => setIsIncome(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        Income source (e.g. salary lands here)
      </label>

      {err && <p className="text-sm text-neg">{err}</p>}

      <div className="flex gap-2 pt-1">
        <Button onClick={save} className="flex-1">
          {editing ? 'Save changes' : 'Add account'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
