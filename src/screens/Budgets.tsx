import { useState } from 'react'
import { monthKey } from '../lib/balances'
import MonthNav from '../components/MonthNav'
import BudgetSummary from '../components/BudgetSummary'
import { SectionTitle } from '../ui/common'

export default function Budgets() {
  const [month, setMonth] = useState(monthKey(Date.now()))

  return (
    <div className="space-y-5">
      <SectionTitle>Budgets</SectionTitle>
      <MonthNav monthKey={month} onChange={setMonth} />
      <BudgetSummary month={month} />
    </div>
  )
}
