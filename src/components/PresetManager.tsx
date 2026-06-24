import { useState } from 'react'
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react'
import { useAllAccounts, useCategories, useSettings } from '../hooks'
import { upsertPreset, deletePreset } from '../db/repo'
import { newId } from '../db/db'
import { parseMajorInput, formatPHP } from '../lib/money'
import type { QuickAddPreset } from '../db/types'
import { Button, Field, Input, Select } from '../ui/form'
import { Dot, Eyebrow, EmptyState } from '../ui/common'

type Draft = {
  id: string
  label: string
  amount: string // major-unit text
  type: 'expense' | 'income'
  categoryId: string
  accountId: string
}

const emptyDraft = (): Draft => ({
  id: '',
  label: '',
  amount: '',
  type: 'expense',
  categoryId: '',
  accountId: '',
})

const toDraft = (p: QuickAddPreset): Draft => ({
  id: p.id,
  label: p.label,
  amount: (p.amount / 100).toString(),
  type: p.type,
  categoryId: p.categoryId ?? '',
  accountId: p.accountId ?? '',
})

/**
 * Manage the home-screen widget's quick-add presets — one-tap "log this"
 * buttons. Each is { label, amount, type, category?, account? }; stored on the
 * settings singleton and published into the widget snapshot.
 */
export default function PresetManager() {
  const accounts = useAllAccounts().filter((a) => !a.archived)
  const categories = useCategories()
  const settings = useSettings()
  const presets = settings?.quickAddPresets ?? []

  const [draft, setDraft] = useState<Draft | null>(null)
  const [err, setErr] = useState('')

  const startAdd = () => {
    setErr('')
    setDraft(emptyDraft())
  }
  const startEdit = (p: QuickAddPreset) => {
    setErr('')
    setDraft(toDraft(p))
  }

  const save = async () => {
    if (!draft) return
    const minor = parseMajorInput(draft.amount)
    if (minor === null || minor <= 0) {
      setErr('Enter an amount greater than zero.')
      return
    }
    const label = draft.label.trim() || `${draft.type === 'income' ? '+' : ''}${formatPHP(minor)}`
    await upsertPreset({
      id: draft.id || newId(),
      label,
      amount: minor,
      type: draft.type,
      categoryId: draft.categoryId || undefined,
      accountId: draft.accountId || undefined,
    })
    setDraft(null)
  }

  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? 'Default account'
  const categoryName = (id?: string) => categories.find((c) => c.id === id)?.name
  const kindCats = draft ? categories.filter((c) => c.kind === draft.type) : []

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        One-tap buttons on the home-screen widget. Tapping one logs the amount instantly —
        no app, no typing.
      </p>

      {presets.length === 0 ? (
        <EmptyState title="No presets yet" hint="Add a common expense so it's one tap from the widget." />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {presets.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center gap-3 px-3.5 py-3 ${i > 0 ? 'border-t border-border' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {p.label}
                  <span className={`ml-2 text-xs font-semibold ${p.type === 'income' ? 'text-pos' : 'text-neg'}`}>
                    {p.type === 'income' ? '+' : '−'}
                    {formatPHP(p.amount)}
                  </span>
                </p>
                <p className="flex items-center gap-1.5 text-xs text-dim">
                  {categoryName(p.categoryId) && (
                    <>
                      <Dot color={categories.find((c) => c.id === p.categoryId)?.color} />
                      {categoryName(p.categoryId)} ·{' '}
                    </>
                  )}
                  {accountName(p.accountId)}
                </p>
              </div>
              <button
                onClick={() => startEdit(p)}
                aria-label={`Edit ${p.label}`}
                className="rounded-pill p-1.5 text-muted hover:text-text"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => deletePreset(p.id)}
                aria-label={`Delete ${p.label}`}
                className="rounded-pill p-1.5 text-muted hover:text-neg"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {draft ? (
        <div className="space-y-3 rounded-card border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <Eyebrow>{draft.id ? 'Edit preset' : 'New preset'}</Eyebrow>
            <button onClick={() => setDraft(null)} aria-label="Cancel" className="text-dim hover:text-text">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(['expense', 'income'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDraft({ ...draft, type: t, categoryId: '' })}
                className={`rounded-tile border px-2 py-2 text-sm font-semibold capitalize ${
                  draft.type === t
                    ? t === 'expense'
                      ? 'border-neg text-neg'
                      : 'border-pos text-pos'
                    : 'border-border text-muted'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <Field label="Label">
            <Input
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="e.g. Food ₱100"
            />
          </Field>

          <Field label="Amount">
            <Input
              inputMode="decimal"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              placeholder="0.00"
            />
          </Field>

          <Field label="Category">
            <Select
              value={draft.categoryId}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
            >
              <option value="">Uncategorized</option>
              {kindCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Account">
            <Select
              value={draft.accountId}
              onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}
            >
              <option value="">Default account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>

          {err && <p className="text-sm text-neg">{err}</p>}

          <Button onClick={save} className="w-full">
            <span className="inline-flex items-center gap-1.5">
              <Check size={15} /> Save preset
            </span>
          </Button>
        </div>
      ) : (
        <Button variant="ghost" className="w-full" onClick={startAdd}>
          <span className="inline-flex items-center gap-1.5">
            <Plus size={15} /> Add preset
          </span>
        </Button>
      )}
    </div>
  )
}
