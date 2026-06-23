import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Field, Input, Select } from '../ui/form'
import { useAccounts, useCategories } from '../hooks'
import {
  addRecurring,
  updateRecurring,
  deleteRecurring,
  processDueRecurring,
  addCategory,
} from '../db/repo'
import { parseMajorInput, fromMinor } from '../lib/money'
import { toDateInput, fromDateInput } from '../lib/dates'
import type { RecurringRule, RecurringFreq } from '../db/types'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
type Kind = 'expense' | 'income'

/** Add / edit a recurring rule. Self-contained; `onDone` closes the host modal. */
export default function RecurringForm({
  rule,
  onDone,
}: {
  rule?: RecurringRule
  onDone: () => void
}) {
  const accounts = useAccounts()
  const categories = useCategories()
  const editing = !!rule

  const [type, setType] = useState<Kind>('expense')
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [freq, setFreq] = useState<RecurringFreq>('monthly')
  const [interval, setIntervalN] = useState('1')
  const [anchorDay, setAnchorDay] = useState(1)
  const [startDate, setStartDate] = useState(toDateInput(Date.now()))
  const [endDate, setEndDate] = useState('')
  const [autoPost, setAutoPost] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (rule) {
      setType(rule.type)
      setAccountId(rule.accountId)
      setAmount(String(Math.abs(fromMinor(rule.amount))))
      setCategoryName(categories.find((c) => c.id === rule.categoryId)?.name ?? '')
      setFreq(rule.freq)
      setIntervalN(String(rule.interval))
      setAnchorDay(rule.anchorDay ?? new Date(rule.startDate).getDate())
      setStartDate(toDateInput(rule.startDate))
      setEndDate(rule.endDate ? toDateInput(rule.endDate) : '')
      setAutoPost(rule.autoPost)
    } else {
      const today = new Date()
      setType('expense')
      setAccountId(accounts[0]?.id ?? '')
      setAmount('')
      setCategoryName('')
      setFreq('monthly')
      setIntervalN('1')
      setAnchorDay(today.getDate())
      setStartDate(toDateInput(today.getTime()))
      setEndDate('')
      setAutoPost(true)
    }
    setErr('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule])

  // useAccounts is a live query that returns [] on first render, so the default
  // set above can miss. Backfill the first account once they load (add mode only).
  useEffect(() => {
    if (!accountId && accounts.length) setAccountId(accounts[0].id)
  }, [accounts, accountId])

  const cats = categories.filter((c) => c.kind === type)

  // Re-seed the anchor from the start date when the unit changes (weekday for
  // weekly, day-of-month otherwise) so it's never an out-of-range value.
  const changeFreq = (f: RecurringFreq) => {
    setFreq(f)
    const d = new Date(fromDateInput(startDate))
    setAnchorDay(f === 'weekly' ? d.getDay() : d.getDate())
  }

  const save = async () => {
    const minor = parseMajorInput(amount)
    if (minor === null || minor <= 0) return setErr('Enter an amount greater than zero.')
    if (!accountId) return setErr('Pick an account.')
    const startMs = fromDateInput(startDate)
    const endMs = endDate ? fromDateInput(endDate) : undefined
    if (endMs != null && endMs < startMs) return setErr('End date is before the start date.')
    const n = Math.max(1, Math.floor(Number(interval) || 1))

    try {
      const name = categoryName.trim()
      const categoryId = name ? await addCategory({ name, kind: type }) : undefined
      const fields = {
        accountId,
        type,
        amount: minor,
        categoryId,
        note: name || undefined,
        freq,
        interval: n,
        anchorDay,
        startDate: startMs,
        endDate: endMs,
        autoPost,
      }
      if (editing) await updateRecurring(rule!.id, fields)
      else await addRecurring(fields)
      // Catch up immediately so a past-dated auto rule posts without waiting for
      // the next app start.
      await processDueRecurring()
      onDone()
    } catch (e) {
      setErr(`Couldn't save — ${e instanceof Error ? e.message : 'please try again.'}`)
    }
  }

  const remove = async () => {
    if (rule) await deleteRecurring(rule.id)
    onDone()
  }

  if (accounts.length === 0) {
    return <p className="text-sm text-muted">Add an account first, then set up recurring items.</p>
  }

  const unit = freq === 'weekly' ? 'week' : freq === 'yearly' ? 'year' : 'month'

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(['expense', 'income'] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setType(k)
              setCategoryName('')
            }}
            className={`rounded-tile border px-2 py-2 text-sm font-semibold capitalize ${
              type === k
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

      <Field label="Category / name">
        <Input
          list="recurring-category-options"
          value={categoryName}
          onChange={(e) => setCategoryName(e.target.value)}
          placeholder="e.g. Salary, Rent, Netflix"
          autoComplete="off"
        />
        <datalist id="recurring-category-options">
          {cats.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Frequency">
          <Select value={freq} onChange={(e) => changeFreq(e.target.value as RecurringFreq)}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </Field>
        <Field label={`Every N ${unit}s`}>
          <Input
            type="number"
            min={1}
            value={interval}
            onChange={(e) => setIntervalN(e.target.value)}
          />
        </Field>
      </div>

      {freq === 'weekly' ? (
        <Field label="On">
          <Select value={anchorDay} onChange={(e) => setAnchorDay(Number(e.target.value))}>
            {WEEKDAYS.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="Day of month">
          <Input
            type="number"
            min={1}
            max={31}
            value={anchorDay}
            onChange={(e) => setAnchorDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Start date">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="End date (optional)">
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>

      <div>
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dim">
          When it's due
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setAutoPost(true)}
            className={`rounded-tile border px-2 py-2 text-sm font-semibold ${
              autoPost ? 'border-accent text-accent' : 'border-border text-muted'
            }`}
          >
            Add automatically
          </button>
          <button
            type="button"
            onClick={() => setAutoPost(false)}
            className={`rounded-tile border px-2 py-2 text-sm font-semibold ${
              !autoPost ? 'border-accent text-accent' : 'border-border text-muted'
            }`}
          >
            Remind me
          </button>
        </div>
      </div>

      {err && <p className="text-sm text-neg">{err}</p>}

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={save} className="flex-1">
          {editing ? 'Save' : 'Add'}
        </Button>
        {editing && (
          <Button variant="danger" onClick={remove} aria-label="Delete recurring item">
            <span className="inline-flex items-center gap-1.5">
              <Trash2 size={15} /> Delete
            </span>
          </Button>
        )}
      </div>
    </div>
  )
}
