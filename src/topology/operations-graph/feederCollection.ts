import type { StoragePort, StorageReader } from '../../platform/storage-port'
import { readStored, writeStored } from '../../workspace/storageValidation'
import { feederCollectionRule } from './collectionValidation'
import { changeSwitch, initialSwitchingPlan, readSwitchingPlan, requestDispatch } from './switchingLedger'
import type { SwitchingPlan } from './switchingLedger'
import { claimControlRequest, controlWorkInbox, directAssignCritical } from './controlWorkload'
import type { FeederWorkRecord } from './controlWorkload'

export interface FeederRecord { id: string; outageGroupId: string; plan: SwitchingPlan; archived: boolean }
export interface OutageGroup { id: string; revision: number; feederIds: readonly string[] }
export interface FeederCollection { feeders: readonly FeederRecord[]; groups: readonly OutageGroup[]; audit: readonly { action: string; id: string; related: readonly string[] }[] }
export interface FeederBatch { collection: FeederCollection; updated: string[]; skipped: string[]; blocked: { id: string; reason: string }[] }
const key = 'gridpulse:feeder-collection:v1'
function forFeeder(id: string, plan: SwitchingPlan): SwitchingPlan {
  return { ...plan, edges: plan.edges.map(edge => ({ ...edge,
    from: edge.from === 'F-12' ? id : edge.from, to: edge.to === 'F-12' ? id : edge.to })) }
}
function prepared(id: string, mw: number | null): SwitchingPlan {
  const clear = changeSwitch(forFeeder(id, initialSwitchingPlan), 'SW-2')
  return mw === null ? clear : requestDispatch(clear, mw)
}
export function seedFeederCollection(legacy: SwitchingPlan = initialSwitchingPlan): FeederCollection {
  return { feeders: [
    { id: 'F-12', outageGroupId: 'OUT-NORTH', plan: legacy, archived: false },
    { id: 'F-13', outageGroupId: 'OUT-NORTH', plan: prepared('F-13', 8), archived: false },
    { id: 'F-14', outageGroupId: 'OUT-NORTH', plan: prepared('F-14', 18), archived: false },
    { id: 'F-21', outageGroupId: 'OUT-SOUTH', plan: prepared('F-21', 9), archived: false },
    { id: 'F-22', outageGroupId: 'OUT-SOUTH', plan: prepared('F-22', null), archived: false },
    { id: 'F-23', outageGroupId: 'OUT-SOUTH', plan: prepared('F-23', null), archived: true },
  ], groups: [
    { id: 'OUT-NORTH', revision: 1, feederIds: ['F-12', 'F-13', 'F-14'] },
    { id: 'OUT-SOUTH', revision: 1, feederIds: ['F-21', 'F-22', 'F-23'] },
  ], audit: [] }
}
export function readFeederCollection(storage: StorageReader): FeederCollection {
  return readStored(storage, key, feederCollectionRule, () => seedFeederCollection(readSwitchingPlan(storage)),
    'gridpulse:switching-plan:v1')
}
export function saveFeederCollection(storage: StoragePort, value: FeederCollection): FeederCollection {
  return writeStored(storage, key, feederCollectionRule, value)
}
export function feederById(value: FeederCollection, id: string): FeederRecord {
  const record = value.feeders.find(item => item.id === id)
  if (!record) throw new Error(`Feeder ${id} was not found.`)
  return record
}
export function feederRows(value: FeederCollection, query = '', filter = 'active'): FeederRecord[] {
  const needle = query.trim().toLowerCase()
  return value.feeders.filter(item => (filter === 'all' || (filter === 'archived') === item.archived) &&
    (!needle || `${item.id} ${item.outageGroupId}`.toLowerCase().includes(needle))).toSorted((a, b) => a.id.localeCompare(b.id))
}
export function feederInbox(value: FeederCollection) {
  return controlWorkInbox(value.feeders.filter(item => !item.archived).map(item => ({ feederId: item.id, plan: item.plan })))
}
export function assignFeederControl(value: FeederCollection, id: string, controllerId: string, expectedRevision: number): FeederCollection {
  const record = feederById(value, id)
  if (record.archived) throw new Error('Archived feeder cannot receive dispatch assignment.')
  const records: FeederWorkRecord[] = value.feeders.filter(item => !item.archived).map(item => ({ feederId: item.id, plan: item.plan }))
  const request = record.plan.dispatchRequests?.find(item => item.status === 'open')
  const workRecord: FeederWorkRecord = { feederId: record.id, plan: record.plan }
  const plan = request && request.mw >= 15 ? directAssignCritical(workRecord, controllerId, 'control supervisor',
    'Critical dispatch needs direct assignment.', records) : claimControlRequest(workRecord, controllerId, records, expectedRevision)
  return { ...value, feeders: value.feeders.map(item => item.id === id ? { ...item, plan } : item),
    audit: [...value.audit, { action: request && request.mw >= 15 ? 'critical-assigned' : 'dispatch-claimed', id, related: [controllerId] }] }
}
export function reviseOutageGroup(value: FeederCollection, groupId: string, expectedRevision: number): FeederBatch {
  const group = value.groups.find(item => item.id === groupId)
  if (group?.revision !== expectedRevision) throw new Error('Outage group revision changed.')
  const updated: string[] = []; const skipped: string[] = []; const blocked: FeederBatch['blocked'] = []
  const feeders = value.feeders.map(item => {
    if (!group.feederIds.includes(item.id) || item.archived) { skipped.push(item.id); return item }
    try { const plan = changeSwitch(item.plan, 'SW-2'); updated.push(item.id); return { ...item, plan } }
    catch (error) { blocked.push({ id: item.id, reason: error instanceof Error ? error.message : 'Switch update blocked.' }); return item }
  })
  return { collection: { ...value, feeders, groups: value.groups.map(item => item.id === groupId ?
    { ...item, revision: item.revision + 1 } : item),
    audit: [...value.audit, { action: 'outage-revised', id: groupId, related: updated }] }, updated, skipped, blocked }
}
export function requestFeederDispatches(value: FeederCollection, ids: readonly string[], mw: number): FeederBatch {
  const updated: string[] = []; const skipped: string[] = []; const blocked: FeederBatch['blocked'] = []
  const unique = new Set(ids)
  const feeders = value.feeders.map(item => {
    if (!unique.has(item.id)) return item
    if (item.archived || item.plan.dispatchMw !== null) { skipped.push(item.id); return item }
    try { const plan = requestDispatch(item.plan, mw); updated.push(item.id); return { ...item, plan } }
    catch (error) { blocked.push({ id: item.id, reason: error instanceof Error ? error.message : 'Dispatch request blocked.' }); return item }
  })
  for (const id of unique) if (!value.feeders.some(item => item.id === id)) blocked.push({ id, reason: 'Feeder not found.' })
  return { collection: { ...value, feeders, audit: [...value.audit, { action: 'dispatches-requested', id: 'selection', related: updated }] }, updated, skipped, blocked }
}
export function createFeeder(value: FeederCollection, id: string, groupId: string): FeederCollection {
  if (!/^F-\d{2}$/.test(id) || value.feeders.some(item => item.id === id)) throw new Error('Enter a unique feeder ID.')
  const group = value.groups.find(item => item.id === groupId)
  if (!group) throw new Error('Outage group not found.')
  return { ...value, feeders: [...value.feeders, { id, outageGroupId: groupId, plan: forFeeder(id, initialSwitchingPlan), archived: false }],
    groups: value.groups.map(item => item.id === groupId ? { ...item, feederIds: [...item.feederIds, id] } : item),
    audit: [...value.audit, { action: 'feeder-created', id, related: [groupId] }] }
}
export function archiveFeeder(value: FeederCollection, id: string): FeederCollection {
  const record = feederById(value, id)
  if (record.archived || record.plan.dispatchRequests?.some(item => item.status === 'open') || record.plan.dispatchMw !== null)
    throw new Error('Resolve open or committed dispatch before archiving feeder.')
  return { ...value, feeders: value.feeders.map(item => item.id === id ? { ...item, archived: true } : item),
    audit: [...value.audit, { action: 'feeder-archived', id, related: [record.outageGroupId] }] }
}
