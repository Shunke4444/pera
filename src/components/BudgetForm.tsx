import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Budget, Category } from '../db/types'
import { addBudget, updateBudget, deleteBudget } from '../db/repo'
import { fromMinor, parseMajorInput } from '../lib/money'
import { Button, Field, Input, Select } from '../ui/form'

export default function BudgetForm({
  budget,
  categories,
  takenCategoryIds,
  onDone,
}: {
  budget?: Budget
  categories: Category[]
  takenCategoryIds: string[]
  onDone: () => void
}) {
  const editing = !!budget
  const available = categories.filter(
    (c) => c.kind === 'expense' && (c.id === budget?.categoryId || !takenCategoryIds.includes(c.id)),
  )
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? available[0]?.id ?? '')
  const [amount, setAmount] = useState(budget ? String(fromMinor(budget.amount)) : '')
  const [rollover, setRollover] = useState(budget?.rollover ?? false)
  const [err, setErr] = useState('')

  const save = async () => {
    const minor = parseMajorInput(amount)
    if (minor === null || minor <= 0) return setErr('Enter a monthly limit.')
    if (!categoryId) return setErr('Pick a category.')
    try {
      if (editing) {
        await updateBudget(budget!.id, { amount: minor, rollover })
      } else {
        await addBudget({ categoryId, amount: minor, rollover })
      }
      onDone()
    } catch (e) {
      setErr(`Couldn't save — ${e instanceof Error ? e.message : 'please try again.'}`)
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Category">
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={editing}>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Monthly limit">
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          autoFocus
        />
      </Field>
      <label className="flex items-center gap-2 py-1 text-sm">
        <input
          type="checkbox"
          checked={rollover}
          onChange={(e) => setRollover(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        Roll unspent budget into next month
      </label>

      {err && <p className="text-sm text-neg">{err}</p>}

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={save} className="flex-1">
          {editing ? 'Save' : 'Add budget'}
        </Button>
        {editing && (
          <Button
            variant="danger"
            onClick={async () => {
              await deleteBudget(budget!.id)
              onDone()
            }}
            aria-label="Delete budget"
          >
            <Trash2 size={15} />
          </Button>
        )}
      </div>
    </div>
  )
}
