import { useEffect } from 'react'
import { useTransactions, useSettings } from '../hooks'
import { publishSnapshot } from '../lib/snapshot'

/**
 * Republishes the widget snapshot whenever transactions or settings change —
 * the generic "after every transaction write" trigger (every write flows
 * through Dexie, so the live query fires). Renders nothing; isolated in its own
 * component so these live queries don't re-render the whole app shell.
 */
export default function SnapshotPublisher() {
  const txns = useTransactions()
  const settings = useSettings()
  useEffect(() => {
    void publishSnapshot()
  }, [txns, settings])
  return null
}
