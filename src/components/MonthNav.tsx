import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthLabel, shiftMonth } from '../lib/dates'

export default function MonthNav({
  monthKey,
  onChange,
}: {
  monthKey: string
  onChange: (next: string) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-pill border border-border bg-surface px-2 py-1.5">
      <button
        onClick={() => onChange(shiftMonth(monthKey, -1))}
        aria-label="Previous month"
        className="rounded-pill p-1 text-muted hover:text-text"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="font-display text-sm font-bold">{monthLabel(monthKey)}</span>
      <button
        onClick={() => onChange(shiftMonth(monthKey, 1))}
        aria-label="Next month"
        className="rounded-pill p-1 text-muted hover:text-text"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
