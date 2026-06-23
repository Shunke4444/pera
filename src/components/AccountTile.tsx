import { useNavigate } from 'react-router-dom'
import { Smartphone, Landmark, CreditCard, Banknote, LineChart } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Account, AccountType } from '../db/types'
import { formatCompactPHP, formatPHP, MASK } from '../lib/money'
import { textColorOn } from '../lib/color'
import { TYPE_LABEL } from '../lib/accounts'
import { useHiddenBalances } from '../hooks'

const TYPE_ICON: Record<AccountType, LucideIcon> = {
  ewallet: Smartphone,
  savings: Landmark,
  checking: Landmark,
  credit: CreditCard,
  cash: Banknote,
  investment: LineChart,
}

/**
 * Vivid half-width account card: the account's brand `color` fills the card and
 * text color is chosen by luminance for guaranteed contrast. Type label sits
 * top, the balance is the hero, name + type glyph anchor the bottom. The whole
 * tile taps through to AccountDetail. The per-account brand `color` is the one
 * allowed inline exception to design tokens.
 */
export default function AccountTile({ account, balance }: { account: Account; balance: number }) {
  const navigate = useNavigate()
  const [hidden] = useHiddenBalances()
  const Icon = TYPE_ICON[account.type] ?? Banknote
  const brand = account.color || '#34D399'
  const ink = textColorOn(brand)

  return (
    <button
      onClick={() => navigate(`/account/${account.id}`)}
      className="relative flex min-h-[104px] flex-col justify-between overflow-hidden rounded-card p-3.5 text-left"
      style={{ background: brand, color: ink }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ opacity: 0.8 }}>
        {TYPE_LABEL[account.type] ?? account.type}
      </span>

      <p
        className="mt-2 font-display text-[19px] font-bold leading-tight tracking-tight"
        title={hidden ? undefined : formatPHP(balance)}
      >
        {hidden ? MASK : formatCompactPHP(balance)}
      </p>

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium" style={{ opacity: 0.9 }}>
            {account.name}
          </p>
          {account.isIncomeSource && (
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ opacity: 0.75 }}>
              Income source
            </p>
          )}
        </div>
        <Icon size={16} className="flex-none" style={{ opacity: 0.85 }} aria-hidden />
      </div>
    </button>
  )
}
