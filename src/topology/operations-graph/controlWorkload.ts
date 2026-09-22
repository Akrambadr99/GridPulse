import type { SwitchingPlan } from './switchingLedger'

export interface ControlEngineer {
  id: string
  name: string
  feeders: readonly string[]
  maxMw: number
  maxOpenDispatches: number
  available: boolean
}
export interface FeederWorkRecord { feederId: string; plan: SwitchingPlan }
export interface ControlWorkItem {
  requestId: string
  feederId: string
  mw: number
  critical: boolean
  assigneeId: string | null
  status: 'open' | 'stale'
  sourceRevision: number
  actionable: boolean
}

export const controlEngineers: readonly ControlEngineer[] = [
  { id: 'control-ada', name: 'Ada Kim', feeders: ['F-12', 'F-13'], maxMw: 22, maxOpenDispatches: 2, available: true },
  { id: 'control-samir', name: 'Samir Ali', feeders: ['F-12'], maxMw: 12, maxOpenDispatches: 1, available: true },
  { id: 'control-luca', name: 'Luca Moretti', feeders: ['F-13'], maxMw: 22, maxOpenDispatches: 2, available: false },
]

export function controlWorkInbox(records: readonly FeederWorkRecord[], actorId?: string): ControlWorkItem[] {
  return records.flatMap(({ feederId, plan }) => (plan.dispatchRequests ?? []).filter(item =>
    item.status === 'open' || item.status === 'stale').map(item => ({
    requestId: item.id, feederId, mw: item.mw, critical: item.mw >= 15,
    assigneeId: item.assigneeId ?? null, status: item.status as 'open' | 'stale',
    sourceRevision: item.sourceRevision, actionable: item.status === 'open' && item.sourceRevision === plan.revision,
  }))).filter(item => actorId === undefined || item.assigneeId === actorId)
    .sort((a, b) => Number(b.critical) - Number(a.critical) ||
      Number(b.actionable) - Number(a.actionable) || a.sourceRevision - b.sourceRevision ||
      a.feederId.localeCompare(b.feederId) || a.requestId.localeCompare(b.requestId))
}

export function controlWorkload(records: readonly FeederWorkRecord[], actorId: string): number {
  return controlWorkInbox(records, actorId).filter(item => item.actionable).length
}

export function controlEligibility(records: readonly FeederWorkRecord[], feederId: string, mw: number, actorId: string): string[] {
  const engineer = controlEngineers.find(item => item.id === actorId)
  const blockers: string[] = []
  if (!engineer?.available) blockers.push('Control engineer is unavailable.')
  if (engineer && !engineer.feeders.includes(feederId)) blockers.push('Engineer is outside feeder scope.')
  if (engineer && mw > engineer.maxMw) blockers.push('Engineer lacks dispatch rating.')
  if (engineer && controlWorkload(records, actorId) >= engineer.maxOpenDispatches) blockers.push('Engineer is at capacity.')
  return blockers
}

function assign(plan: SwitchingPlan, requestId: string, actorId: string, action: string): SwitchingPlan {
  const revision = plan.revision + 1
  return { ...plan, revision, dispatchRequests: plan.dispatchRequests?.map(item => item.id === requestId ?
    { ...item, assigneeId: actorId, sourceRevision: revision } : item),
    history: [...plan.history, { revision, action, affected: requestId }] }
}

export function claimControlRequest(record: FeederWorkRecord, actorId: string,
  records: readonly FeederWorkRecord[], expectedRevision: number): SwitchingPlan {
  const plan = record.plan
  if (plan.revision !== expectedRevision) throw new Error('Topology revision changed before claim.')
  const request = (plan.dispatchRequests ?? []).find(item => item.status === 'open')
  if (request?.sourceRevision !== plan.revision) throw new Error('Only a current dispatch request may be claimed.')
  if (request.assigneeId) throw new Error('Dispatch request is already claimed.')
  if (request.mw >= 15) throw new Error('Critical dispatch requires direct supervisor assignment.')
  const blockers = controlEligibility(records, record.feederId, request.mw, actorId)
  if (blockers.length) throw new Error(blockers[0])
  return assign(plan, request.id, actorId, 'dispatch-claimed')
}

export function directAssignCritical(record: FeederWorkRecord, actorId: string, supervisor: string,
  reason: string, records: readonly FeederWorkRecord[]): SwitchingPlan {
  if (supervisor !== 'control supervisor' || reason.trim().length < 12) throw new Error('Control supervisor and reason are required.')
  const request = (record.plan.dispatchRequests ?? []).find(item => item.status === 'open')
  if (request?.sourceRevision !== record.plan.revision || request.mw < 15 || request.assigneeId)
    throw new Error('An unclaimed current critical dispatch is required.')
  const blockers = controlEligibility(records, record.feederId, request.mw, actorId)
  if (blockers.length) throw new Error(blockers[0])
  return assign(record.plan, request.id, actorId, 'critical-dispatch-assigned')
}

export function releaseControlClaim(plan: SwitchingPlan, actorId: string): SwitchingPlan {
  const request = (plan.dispatchRequests ?? []).find(item => item.status === 'open' && item.assigneeId === actorId)
  if (request?.sourceRevision !== plan.revision) throw new Error('Only current owner may release dispatch.')
  if (request.mw >= 15) throw new Error('Critical dispatch requires supervisor transfer.')
  const revision = plan.revision + 1
  return { ...plan, revision, dispatchRequests: plan.dispatchRequests?.map(item => item.id === request.id ?
    { ...item, assigneeId: null, sourceRevision: revision } : item),
    history: [...plan.history, { revision, action: 'dispatch-claim-released', affected: request.id }] }
}
