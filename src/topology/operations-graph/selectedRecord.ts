import type { StoragePort } from '../../workspace/repository'
import { bindRecord } from '../../workspace/recordStorage'
import { readFeederCollection, saveFeederCollection } from './feederCollection'
import { readSwitchingPlan } from './switchingLedger'

export function openSelectedRecord(storage: StoragePort, id = 'F-12') {
  return bindRecord(storage, id, {
    key: 'gridpulse:switching-plan:v1',
    collectionKey: 'gridpulse:feeder-collection:v1',
    read: readFeederCollection, save: saveFeederCollection,
    find: (collection, target) => collection.feeders.find(item => item.id === target),
    value: record => record.plan, archived: record => record.archived,
    replace: (collection, target, raw) => {
      const value = readSwitchingPlan({ getItem: () => raw, setItem: () => { throw new Error('Read only decoder.') } })
      return { ...collection, feeders: collection.feeders.map(item => item.id === target ? { ...item, plan: value } : item),
        audit: [...collection.audit, { action: 'detail-updated', id: target, related: [] }] }
    },
  })
}
