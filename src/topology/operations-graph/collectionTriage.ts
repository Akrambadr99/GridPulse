import type { ExplorerPolicy } from '../../workspace/collectionExplorer'
import type { FeederRecord } from './feederCollection'

export const feederTriage: ExplorerPolicy<FeederRecord> = {
  searchText: record => `${record.id} ${record.outageGroupId}`,
  revision: record => record.plan.revision,
  state(record) {
    const requests = record.plan.dispatchRequests ?? []
    const current = requests.find(item => item.status === 'open' && item.sourceRevision === record.plan.revision)
    if (current) return current.assigneeId ? 'assigned' : current.mw >= 15 ? 'critical' : 'unclaimed'
    if (requests.some(item => item.status === 'stale' || item.status === 'open')) return 'stale'
    return record.plan.dispatchMw === null ? 'no-dispatch' : 'committed'
  },
  states: [
    { value: 'critical', label: 'Critical dispatch · unassigned' },
    { value: 'unclaimed', label: 'Routine dispatch · unclaimed' },
    { value: 'assigned', label: 'Current control assignment' },
    { value: 'stale', label: 'Stale dispatch request' },
    { value: 'committed', label: 'Dispatch committed' },
    { value: 'no-dispatch', label: 'No dispatch commitment' },
  ],
}
