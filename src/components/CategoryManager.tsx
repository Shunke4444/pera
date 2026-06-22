import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useCategories } from '../hooks'
import { addCategory, updateCategory, deleteCategory } from '../db/repo'
import type { Category, CategoryKind } from '../db/types'
import { Input } from '../ui/form'
import { Eyebrow } from '../ui/common'

/** One editable category: recolor (live), rename (on blur/Enter), delete. */
function CategoryRow({ cat }: { cat: Category }) {
  const [name, setName] = useState(cat.name)

  const commit = () => {
    const next = name.trim()
    if (next && next !== cat.name) void updateCategory(cat.id, { name: next })
    else setName(cat.name) // revert empty/unchanged
  }

  const remove = () => {
    if (
      window.confirm(
        `Delete "${cat.name}"? Its transactions become uncategorized and any budget on it is removed.`,
      )
    ) {
      void deleteCategory(cat.id)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={cat.color}
        onChange={(e) => void updateCategory(cat.id, { color: e.target.value })}
        aria-label={`${cat.name} color`}
        className="h-9 w-9 flex-none cursor-pointer rounded-tile border border-border bg-surface-2 p-0.5"
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        aria-label={`Rename ${cat.name}`}
        className="flex-1"
      />
      <button
        onClick={remove}
        aria-label={`Delete ${cat.name}`}
        className="rounded-pill p-2 text-muted hover:text-neg"
      >
        <Trash2 size={15} />
      </button>
    </div>
  )
}

/** Type-a-name row to create a new category of the given kind. */
function AddCategory({ kind }: { kind: CategoryKind }) {
  const [name, setName] = useState('')

  const add = async () => {
    const n = name.trim()
    if (!n) return
    await addCategory({ name: n, kind })
    setName('')
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void add()
        }}
        placeholder={`New ${kind} category`}
        className="flex-1"
      />
      <button
        onClick={add}
        aria-label={`Add ${kind} category`}
        className="rounded-pill border border-border p-2 text-accent hover:bg-surface-2"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}

const GROUPS: [string, CategoryKind][] = [
  ['Expense', 'expense'],
  ['Income', 'income'],
]

export default function CategoryManager() {
  const categories = useCategories()

  return (
    <div className="space-y-5">
      {GROUPS.map(([label, kind]) => (
        <section key={kind} className="space-y-2">
          <Eyebrow>{label}</Eyebrow>
          <div className="space-y-2">
            {categories
              .filter((c) => c.kind === kind)
              .map((c) => (
                <CategoryRow key={c.id} cat={c} />
              ))}
            <AddCategory kind={kind} />
          </div>
        </section>
      ))}
    </div>
  )
}
