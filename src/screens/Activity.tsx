import { SectionTitle, EmptyState } from '../ui/common'

export default function Activity() {
  return (
    <div className="space-y-4">
      <SectionTitle>Activity</SectionTitle>
      <EmptyState title="Coming soon" hint="Transactions and filters arrive in the next phase." />
    </div>
  )
}
