import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useAccounts, useCategories, useTransactions, useSettings } from '../hooks'
import { addTransaction, addCategory } from '../db/repo'
import { parseMajorInput } from '../lib/money'
import { parseQuickAddParams, type QuickAddType } from '../lib/quickAdd'
import { publishSnapshot } from '../lib/snapshot'
import { Button, Field, Input } from '../ui/form'
import { Dot, SectionTitle } from '../ui/common'
import type { Category } from '../db/types'

// Remember the last category per kind so quick-add preselects it next time.
const lastCatKey = (type: QuickAddType) => `pera-quickadd-cat-${type}`
const getLastCat = (type: QuickAddType): string =>
  (typeof localStorage !== 'undefined' && localStorage.getItem(lastCatKey(type))) || ''
const setLastCat = (type: QuickAddType, name: string) => {
  try {
    localStorage.setItem(lastCatKey(type), name)
  } catch {
    /* private mode / quota — non-fatal */
  }
}

const MAX_CHIPS = 6

export default function QuickAdd() {
  const { search } = useLocation()
  const navigate = useNavigate()
  const accounts = useAccounts()
  const categories = useCategories()
  const txns = useTransactions()
  const settings = useSettings()

  // Parse the deep-link query ONCE per distinct search string (cold-launch safe).
  const params = useMemo(() => parseQuickAddParams(search), [search])

  const [type, setType] = useState<QuickAddType>(params.type)
  const [amount, setAmount] = useState(params.amount ?? '')
  const [accountId, setAccountId] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [note, setNote] = useState(params.note ?? '')
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  const initedAccount = useRef(false)
  const initedCat = useRef(false)

  // Resolve the default account once data has loaded: query param > setting > first.
  useEffect(() => {
    if (initedAccount.current || accounts.length === 0) return
    const wanted = params.account ?? settings?.defaultAccountId
    const exists = accounts.find((a) => a.id === wanted)
    setAccountId(exists ? exists.id : accounts[0].id)
    initedAccount.current = true
  }, [accounts, settings, params.account])

  // Preselect category: query param > remembered last for this type.
  useEffect(() => {
    if (initedCat.current) return
    const preset = params.category ?? getLastCat(params.type)
    if (preset) setCategoryName(preset)
    initedCat.current = true
  }, [params.category, params.type])

  // Recent/most-used categories for the active type, plus a fill from defaults.
  const chips = useMemo<Category[]>(() => {
    const counts = new Map<string, number>()
    for (const t of txns) {
      if (t.type !== type || !t.categoryId) continue
      counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1)
    }
    const byId = new Map(categories.map((c) => [c.id, c]))
    const ranked = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => byId.get(id))
      .filter((c): c is Category => !!c)
    const kind = type === 'income' ? 'income' : 'expense'
    const fill = categories.filter((c) => c.kind === kind)
    const seen = new Set(ranked.map((c) => c.id))
    for (const c of fill) {
      if (ranked.length >= MAX_CHIPS) break
      if (!seen.has(c.id)) {
        ranked.push(c)
        seen.add(c.id)
      }
    }
    return ranked.slice(0, MAX_CHIPS)
  }, [txns, categories, type])

  const switchType = (t: QuickAddType) => {
    setType(t)
    // Re-arm category preselect for the newly chosen type.
    setCategoryName(getLastCat(t))
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
    try {
      const name = categoryName.trim()
      const categoryId = name ? await addCategory({ name, kind: type }) : undefined
      await addTransaction({
        accountId,
        amount: type === 'expense' ? -minor : minor,
        type,
        categoryId,
        date: Date.now(),
        note: note.trim() || undefined,
      })
      setLastCat(type, name)
      // Refresh the native widget snapshot after the write (no-op on web).
      void publishSnapshot()
      setSaved(true)
      setTimeout(() => navigate('/', { replace: true }), 650)
    } catch (e) {
      setErr(`Couldn't save — ${e instanceof Error ? e.message : 'please try again.'}`)
    }
  }

  if (saved) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-center">
        <div className="space-y-3">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent text-bg">
            <Check size={28} />
          </div>
          <p className="font-display text-lg font-bold">Saved</p>
        </div>
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="space-y-3">
        <SectionTitle>Quick add</SectionTitle>
        <p className="text-sm text-muted">Add an account first, then capture transactions.</p>
        <Button variant="ghost" onClick={() => navigate('/')}>
          Go home
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SectionTitle>Quick add</SectionTitle>

      {/* Type toggle */}
      <div className="grid grid-cols-2 gap-2">
        {(['expense', 'income'] as QuickAddType[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchType(m)}
            className={`rounded-tile border px-2 py-2.5 text-sm font-semibold capitalize ${
              type === m
                ? m === 'expense'
                  ? 'border-neg text-neg'
                  : 'border-pos text-pos'
                : 'border-border text-muted'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Big amount field */}
      <div>
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          autoFocus
          className="text-center font-display text-3xl font-bold tracking-tight"
          aria-label="Amount"
        />
      </div>

      {/* Account chips (no forced picker — default preselected) */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-dim">Account</p>
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAccountId(a.id)}
              className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-sm ${
                accountId === a.id
                  ? 'border-accent text-accent'
                  : 'border-border text-muted'
              }`}
            >
              <Dot color={a.color} />
              {a.name}
            </button>
          ))}
        </div>
      </div>

      {/* Category chips + free-text */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-dim">Category</p>
        <div className="mb-2 flex flex-wrap gap-2">
          {chips.map((c) => {
            const active = categoryName.trim().toLowerCase() === c.name.toLowerCase()
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryName(active ? '' : c.name)}
                className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-sm ${
                  active ? 'border-accent text-accent' : 'border-border text-muted'
                }`}
              >
                <Dot color={c.color} />
                {c.name}
              </button>
            )
          })}
        </div>
        <Input
          list="quickadd-category-options"
          value={categoryName}
          onChange={(e) => setCategoryName(e.target.value)}
          placeholder="Uncategorized — or type a name"
          autoComplete="off"
        />
        <datalist id="quickadd-category-options">
          {categories
            .filter((c) => c.kind === type)
            .map((c) => (
              <option key={c.id} value={c.name} />
            ))}
        </datalist>
      </div>

      <Field label="Note">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
      </Field>

      {err && <p className="text-sm text-neg">{err}</p>}

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={save} className="flex-1">
          Save {type}
        </Button>
        <Button variant="ghost" onClick={() => navigate('/')}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
