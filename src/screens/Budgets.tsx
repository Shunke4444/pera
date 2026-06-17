import { SectionTitle, EmptyState } from '../ui/common'

export default function Budgets() {
  return (
    <div className="space-y-4">
      <SectionTitle>Budgets</SectionTitle>
      <EmptyState title="Coming soon" hint="Monthly category budgets arrive in a later phase." />
    </div>
  )
}
