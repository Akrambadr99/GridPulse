import type { StoragePort } from '../../workspace/repository'
import { readFeederCollection } from './feederCollection'

export function activeRecordWork(storage: StoragePort) {
  return readFeederCollection(storage).feeders.filter(item => !item.archived).map(item => ({ feederId: item.id, plan: item.plan }))
}
export function selectedRecordWork(storage: StoragePort, id: string) {
  const record = activeRecordWork(storage).find(item => item.feederId === id)
  if (!record) throw new Error('Active record not found.')
  return record
}
