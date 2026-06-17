import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'

// Shared form primitives. Token colors only — both themes must read cleanly.

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dim">
      {children}
    </span>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-tile border border-border bg-surface-2 px-3 py-2.5 text-text outline-none focus:border-accent focus:ring-1 focus:ring-accent'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${inputCls} appearance-none ${props.className ?? ''}`}>
      {props.children}
    </select>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
}

export function Button({ variant = 'primary', className = '', ...rest }: ButtonProps) {
  const base =
    'rounded-tile px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50'
  const styles: Record<string, string> = {
    primary: 'bg-accent text-bg hover:opacity-90',
    ghost: 'border border-border bg-surface text-text hover:bg-surface-2',
    danger: 'border border-border bg-surface text-neg hover:bg-surface-2',
  }
  return <button {...rest} className={`${base} ${styles[variant]} ${className}`} />
}
