import type { ReactNode } from 'react'

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-dim">{children}</p>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-lg font-bold tracking-tight">{children}</h2>
}

/** A small brand dot for an account/category color. */
export function Dot({ color }: { color?: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 flex-none rounded-full"
      style={{ background: color || 'var(--text-dim)' }}
    />
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="grid place-items-center rounded-card border border-dashed border-border px-4 py-10 text-center">
      <p className="font-display text-base font-bold text-text">{title}</p>
      {hint && <p className="mt-1 max-w-[18rem] text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Centered spinner-ish loading row for live sections. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <p className="py-8 text-center text-sm text-muted">{label}</p>
}
