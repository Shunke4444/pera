import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { setMonthlyBudget } from '../db/repo'
import { fromMinor, parseMajorInput } from '../lib/money'
import { Button, Field, Input } from '../ui/form'

export default function MonthlyBudgetForm({
  current,
  onDone,
}: {
  current?: number
  onDone: () => void
}) {
  const [amount, setAmount] = useState(current != null ? String(fromMinor(current)) : '')
  const [err, setErr] = useState('')

  const save = async () => {
    const minor = parseMajorInput(amount)
    if (minor === null || minor <= 0) return setErr('Enter a monthly budget greater than zero.')
    try {
      await setMonthlyBudget(minor)
      onDone()
    } catch (e) {
      setErr(`Couldn't save — ${e instanceof Error ? e.message : 'please try again.'}`)
    }
  }

  const remove = async () => {
    await setMonthlyBudget(undefined)
    onDone()
  }

  return (
    <div className="space-y-3">
      <Field label="Total monthly budget">
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          autoFocus
        />
      </Field>
      <p className="text-xs text-muted">
        One cap on your total spending for the month — every expense counts toward it.
      </p>

      {err && <p className="text-sm text-neg">{err}</p>}

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={save} className="flex-1">
          Save
        </Button>
        {current != null && (
          <Button variant="danger" onClick={remove} aria-label="Remove monthly budget">
            <Trash2 size={15} />
          </Button>
        )}
      </div>
    </div>
  )
}
