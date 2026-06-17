import { accounts, peso } from '../data/seed'

const netWorth = accounts.reduce((sum, a) => sum + a.balance, 0)

export default function Dashboard() {
  return (
    <div className="space-y-4">
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-dim">Net worth</p>
        <p className="font-display text-[42px] font-bold leading-none tracking-tight">{peso(netWorth)}</p>
        <p className="mt-1 text-sm font-medium text-pos">▲ 3.1% this month</p>
      </section>

      <section className="grid grid-cols-2 gap-2.5">
        {accounts.map((a) => (
          <div key={a.id} className="rounded-card border border-border bg-surface p-3.5">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
              {a.name}
            </div>
            <p className="mt-1.5 font-display text-lg font-bold tracking-tight">{peso(a.balance)}</p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        <section className="rounded-card border border-border bg-surface p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-dim">Food budget</p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-border">
            <div className="h-full rounded-pill" style={{ width: '70%', background: 'var(--warn)' }} />
          </div>
          <div className="mt-2 flex justify-between text-xs">
            <span className="text-muted">₱4,200 spent</span>
            <span className="font-display font-bold">/ ₱6,000</span>
          </div>
        </section>

        <section className="flex items-center gap-3 rounded-card border border-border bg-surface p-3.5">
          <GoalRing percent={42} />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-dim">Goal</p>
            <p className="text-xs text-muted">Emergency fund</p>
            <p className="mt-0.5 font-display text-sm font-bold">
              ₱42k <span className="font-medium text-dim">/ ₱100k</span>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

function GoalRing({ percent }: { percent: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const fill = (percent / 100) * c
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" className="flex-none">
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${fill} ${c}`}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="36" textAnchor="middle" fill="var(--text)" fontSize="14" fontWeight="700" fontFamily="Space Grotesk, sans-serif">
        {percent}%
      </text>
    </svg>
  )
}
