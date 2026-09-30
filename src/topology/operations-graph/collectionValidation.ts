import { array, booleanValue, finiteNumber, nonEmptyText, nonNegativeInteger, nullable, object, oneOf, optional, refine, text, uniqueBy } from '../../workspace/storageValidation'
import type { GridEdge } from './restoration'
import type { DispatchRequest, SwitchingPlan } from './switchingLedger'
import type { FeederCollection, FeederRecord, OutageGroup } from './feederCollection'

const edge = object<GridEdge>({ id: nonEmptyText, from: text, to: text, closed: booleanValue, capacityMw: finiteNumber })
const dispatch = object<DispatchRequest>({
  id: nonEmptyText, sourceRevision: nonNegativeInteger, requestedBy: text, assignee: text,
  assigneeId: optional(nullable(text)), status: oneOf('open', 'stale', 'completed', 'cancelled', 'superseded'),
  supersedesId: optional(text), mw: finiteNumber,
})
const plan = object<SwitchingPlan>({
  edges: uniqueBy(array(edge), 'id'), dispatchMw: nullable(finiteNumber), switchOwner: text,
  dispatchRequests: optional(uniqueBy(array(dispatch), 'id')), revision: nonNegativeInteger,
  history: array(object<SwitchingPlan['history'][number]>({ revision: nonNegativeInteger, action: text, affected: text })),
})
const feeder = object<FeederRecord>({ id: nonEmptyText, outageGroupId: nonEmptyText, plan, archived: booleanValue })
const group = object<OutageGroup>({
  id: nonEmptyText, revision: nonNegativeInteger,
  feederIds: refine(array(nonEmptyText), ids => new Set(ids).size === ids.length, 'duplicate feeder membership'),
})

/** Topology findings and stale dispatches remain legitimate persisted workflow states. */
export const feederCollectionRule = refine(object<FeederCollection>({
  feeders: uniqueBy(array(feeder), 'id'), groups: uniqueBy(array(group), 'id'),
  audit: array(object<FeederCollection['audit'][number]>({ action: text, id: text, related: array(text) })),
}), collection => {
  const memberships = new Map<string, string>()
  for (const parent of collection.groups) {
    for (const id of parent.feederIds) {
      if (memberships.has(id)) return false
      memberships.set(id, parent.id)
    }
  }
  return memberships.size === collection.feeders.length && collection.feeders.every(record => memberships.get(record.id) === record.outageGroupId)
},
'outage group and feeder membership references are inconsistent')
