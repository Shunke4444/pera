import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import AppLayout from './ui/AppLayout'
import Dashboard from './screens/Dashboard'
import AccountDetail from './screens/AccountDetail'
import Settings from './screens/Settings'
import Activity from './screens/Activity'
import Budgets from './screens/Budgets'
import Goals from './screens/Goals'
import { Loading } from './ui/common'

// Heavy screens (Recharts / SheetJS / pdfjs) are split out so the initial
// load stays light on mobile.
const Insights = lazy(() => import('./screens/Insights'))
const Import = lazy(() => import('./screens/Import'))

export default function App() {
  return (
    <AppLayout>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/account/:id" element={<AccountDetail />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/import" element={<Import />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </Suspense>
    </AppLayout>
  )
}
