import { SectionTitle, EmptyState } from '../ui/common'

export default function Goals() {
  return (
    <div className="space-y-4">
      <SectionTitle>Goals</SectionTitle>
      <EmptyState title="Coming soon" hint="Savings goals arrive in a later phase." />
    </div>
  )
}
