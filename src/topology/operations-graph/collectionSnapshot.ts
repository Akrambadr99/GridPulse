import type { SnapshotAdapter } from '../../workspace/collectionSnapshot'
import { readFeederCollection, type FeederCollection } from './feederCollection'
import { feederCollectionRule } from './collectionValidation'

/** Only this primary collection is included; other browser-local workflows remain separate. */
export const collectionSnapshotAdapter: SnapshotAdapter<FeederCollection> = {
  product: 'GridPulse',
  scope: 'feeder-collection',
  label: 'Feeder operations collection',
  read: readFeederCollection,
  validate: feederCollectionRule,
  groups: collection => [
    { key: 'feeders', label: 'Feeders', records: collection.feeders.map(record => ({
      id: record.id, label: `${record.outageGroupId}${record.archived ? ' · Archived' : ''}`, value: record,
    })) },
    { key: 'groups', label: 'Outage groups', records: collection.groups.map(record => ({
      id: record.id, label: record.id, value: record,
    })) },
  ],
}
