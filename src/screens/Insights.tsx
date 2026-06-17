import { SectionTitle, EmptyState } from '../ui/common'

export default function Insights() {
  return (
    <div className="space-y-4">
      <SectionTitle>Insights</SectionTitle>
      <EmptyState title="Coming soon" hint="Charts arrive in a later phase." />
    </div>
  )
}
