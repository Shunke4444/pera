import { useNavigate } from 'react-router-dom'
import { Smartphone, Landmark, CreditCard, Banknote, LineChart } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Account, AccountType } from '../db/types'
import { formatCompactPHP, formatPHP } from '../lib/money'

const TYPE_ICON: Record<AccountType, LucideIcon> = {
  ewallet: Smartphone,
  savings: Landmark,
  checking: Landmark,
  credit: CreditCard,
  cash: Banknote,
  investment: LineChart,
}

const TYPE_LABEL: Record<AccountType, string> = {
  ewallet: 'E-wallet',
  savings: 'Savings',
  checking: 'Checking',
  credit: 'Credit',
  cash: 'Cash',
  investment: 'Investment',
}

/**
 * Half-width account card for the dashboard grid: brand accent bar + brand icon
 * chip + type pill + name + balance. The whole tile taps through to AccountDetail.
 * The per-account brand `color` is the one allowed inline exception to tokens.
 */
export default function AccountTile({ account, balance }: { account: Account; balance: number }) {
  const navigate = useNavigate()
  const Icon = TYPE_ICON[account.type] ?? Banknote
  const brand = account.color || 'var(--accent)'

  return (
    <button
      onClick={() => navigate(`/account/${account.id}`)}
      className="relative overflow-hidden rounded-card border border-border bg-surface p-3.5 text-left"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: brand }}
      />
      <div className="flex items-center justify-between">
        <span
          className="grid h-8 w-8 place-items-center rounded-tile"
          style={{ background: `color-mix(in srgb, ${brand} 16%, transparent)`, color: brand }}
        >
          <Icon size={16} />
        </span>
        <span className="rounded-pill border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-dim">
          {TYPE_LABEL[account.type] ?? account.type}
        </span>
      </div>
      <p className="mt-2.5 truncate text-[13px] font-medium text-text">{account.name}</p>
      <p
        className="mt-0.5 font-display text-[19px] font-bold leading-tight tracking-tight"
        title={formatPHP(balance)}
      >
        {formatCompactPHP(balance)}
      </p>
      {account.isIncomeSource && (
        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
          Income source
        </p>
      )}
    </button>
  )
}
