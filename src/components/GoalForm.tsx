import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Account, Goal } from '../db/types'
import { addGoal, updateGoal, archiveGoal } from '../db/repo'
import { fromMinor, parseMajorInput } from '../lib/money'
import { toDateInput, fromDateInput } from '../lib/dates'
import { Button, Field, Input, Select } from '../ui/form'

const COLORS = ['#34D399', '#3B82F6', '#F97316', '#A855F7', '#F59E0B', '#EF4444']

export default function GoalForm({
  goal,
  accounts,
  onDone,
}: {
  goal?: Goal
  accounts: Account[]
  onDone: () => void
}) {
  const editing = !!goal
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal ? String(fromMinor(goal.targetAmount)) : '')
  const [targetDate, setTargetDate] = useState(goal?.targetDate ? toDateInput(goal.targetDate) : '')
  const [linkedAccountId, setLinkedAccountId] = useState(goal?.linkedAccountId ?? '')
  const [color, setColor] = useState(goal?.color ?? COLORS[0])
  const [err, setErr] = useState('')

  const save = async () => {
    if (!name.trim()) return setErr('Name your goal.')
    const minor = parseMajorInput(target)
    if (minor === null || minor <= 0) return setErr('Enter a target amount.')
    const payload = {
      name: name.trim(),
      targetAmount: minor,
      targetDate: targetDate ? fromDateInput(targetDate) : undefined,
      linkedAccountId: linkedAccountId || undefined,
      color,
    }
    try {
      if (editing) await updateGoal(goal!.id, payload)
      else await addGoal(payload)
      onDone()
    } catch (e) {
      // Surface write failures (e.g. storage blocked / quota) instead of
      // silently closing — the modal stays open so nothing is lost.
      setErr(`Couldn't save — ${e instanceof Error ? e.message : 'please try again.'}`)
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Goal name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund" />
      </Field>
      <Field label="Target amount">
        <Input
          inputMode="decimal"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="0.00"
        />
      </Field>
      <Field label="Target date (optional)">
        <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </Field>
      <Field label="Track an account's balance (optional)">
        <Select value={linkedAccountId} onChange={(e) => setLinkedAccountId(e.target.value)}>
          <option value="">— Manual contributions —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
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

      {err && <p className="text-sm text-neg">{err}</p>}

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={save} className="flex-1">
          {editing ? 'Save' : 'Add goal'}
        </Button>
        {editing && (
          <Button
            variant="danger"
            onClick={async () => {
              await archiveGoal(goal!.id)
              onDone()
            }}
            aria-label="Archive goal"
          >
            <Trash2 size={15} />
          </Button>
        )}
      </div>
    </div>
  )
}
