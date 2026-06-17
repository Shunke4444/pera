export default function GoalRing({
  percent,
  size = 56,
  color = 'var(--accent)',
}: {
  percent: number
  size?: number
  color?: string
}) {
  const r = 26
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, percent))
  const fill = (clamped / 100) * c
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="flex-none">
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${fill} ${c}`}
        transform="rotate(-90 32 32)"
      />
      <text
        x="32"
        y="36"
        textAnchor="middle"
        fill="var(--text)"
        fontSize="14"
        fontWeight="700"
        fontFamily="Space Grotesk, sans-serif"
      >
        {Math.round(clamped)}%
      </text>
    </svg>
  )
}
