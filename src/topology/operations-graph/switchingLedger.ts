import type { StoragePort } from '../../workspace/repository'
import { gridEdges, restorationFindings } from './restoration'
import type { GridEdge } from './restoration'

export interface SwitchingPlan {
  edges: readonly GridEdge[]
  dispatchMw: number | null
  switchOwner: string
  dispatchRequests?: readonly DispatchRequest[] | undefined
  revision: number
  history: readonly { revision: number; action: string; affected: string }[]
}
export interface DispatchRequest {
  id: string
  sourceRevision: number
  requestedBy: string
  assignee: string
  assigneeId?: string | null
  status: 'open' | 'stale' | 'completed' | 'cancelled' | 'superseded'
  supersedesId?: string
  mw: number
}
const key = 'gridpulse:switching-plan:v1'
export const initialSwitchingPlan: SwitchingPlan = { edges: gridEdges, dispatchMw: null, switchOwner: 'switching author', dispatchRequests: [], revision: 0, history: [] }
export function readSwitchingPlan(storage: StoragePort): SwitchingPlan {
  const raw = storage.getItem(key)
  if (!raw) return initialSwitchingPlan
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !('edges' in value) || !Array.isArray(value.edges) ||
    !('dispatchMw' in value) || (value.dispatchMw !== null && typeof value.dispatchMw !== 'number') ||
    !('revision' in value) || typeof value.revision !== 'number' ||
    !('history' in value) || !Array.isArray(value.history)) throw new Error('Invalid switching-plan record.')
  const record = value as Omit<SwitchingPlan, 'switchOwner'> & Partial<Pick<SwitchingPlan, 'switchOwner'>>
  return { ...record, switchOwner: record.switchOwner ?? 'switching author', dispatchRequests: record.dispatchRequests ?? [] }
}
export function controlInbox(plan: SwitchingPlan, actor: string): DispatchRequest[] {
  return (plan.dispatchRequests ?? []).filter(item => item.assignee === actor && item.status === 'open')
}
export function requestDispatch(plan: SwitchingPlan, mw: number, actor = 'switching author', assignee = 'control approver'): SwitchingPlan {
  if (actor !== plan.switchOwner || assignee !== 'control approver' || assignee === actor) throw new Error('Switch author must hand off to independent control.')
  if (dispatchBlockers(plan).length || plan.dispatchMw !== null) throw new Error('Resolve topology before requesting dispatch.')
  if (!Number.isFinite(mw) || mw < 0 || mw > 22) throw new Error('Dispatch exceeds secure battery reserve.')
  if (plan.dispatchRequests?.some(item => item.status === 'open')) throw new Error('An open dispatch request already exists.')
  const revision = plan.revision + 1
  const old = [...(plan.dispatchRequests ?? [])].reverse().find(item => item.status === 'stale')
  const request: DispatchRequest = { id: `DISPATCH-${String(revision)}`, sourceRevision: revision, requestedBy: actor, assignee,
    assigneeId: null, status: 'open', mw, ...(old ? { supersedesId: old.id } : {}) }
  return { ...plan, revision, dispatchRequests: [...(plan.dispatchRequests ?? []).map(item => item.id === old?.id ?
    { ...item, status: 'superseded' as const } : item), request],
    history: [...plan.history, { revision, action: 'dispatch-requested', affected: 'F-12' }] }
}
export function cancelDispatchRequest(plan: SwitchingPlan, id: string, actor: string): SwitchingPlan {
  const request = plan.dispatchRequests?.find(item => item.id === id)
  if (request?.status !== 'open' || actor !== request.requestedBy) throw new Error('Only the requester may cancel an open dispatch request.')
  const revision = plan.revision + 1
  return { ...plan, revision, dispatchRequests: plan.dispatchRequests?.map(item => item.id === id ?
    { ...item, status: 'cancelled' as const } : item), history: [...plan.history, { revision, action: 'dispatch-request-cancelled', affected: id }] }
}
export function dispatchBlockers(plan: SwitchingPlan): string[] {
  return restorationFindings(plan.edges)
}
export function evaluateDispatchRevision(plan: SwitchingPlan, expectedRevision: number): { allowed: boolean; conflicts: string[]; resolutionOptions: string[] } {
  const conflicts = expectedRevision === plan.revision ? [] :
    [`Topology changed from revision ${String(expectedRevision)} to ${String(plan.revision)}; review the current switch plan.`]
  return { allowed: conflicts.length === 0, conflicts, resolutionOptions: conflicts.length ? ['Review current topology'] : [] }
}
export function dispatchApprovalPolicy(plan: SwitchingPlan, actor: string, expectedRevision: number): { allowed: boolean; blockers: string[]; queue: 'switching' | 'control-review' | 'committed' } {
  const blockers = [...evaluateDispatchRevision(plan, expectedRevision).conflicts, ...dispatchBlockers(plan)]
  if (actor !== 'control approver') blockers.push('Control approver authorization is required for dispatch.')
  if (actor === plan.switchOwner) blockers.push('The switching author cannot approve their own dispatch plan.')
  if (plan.dispatchMw !== null) blockers.push('Dispatch interval is already committed.')
  return { allowed: blockers.length === 0, blockers, queue: plan.dispatchMw !== null ? 'committed' : dispatchBlockers(plan).length ? 'switching' : 'control-review' }
}
export function changeSwitch(plan: SwitchingPlan, id: string): SwitchingPlan {
  if (plan.dispatchMw !== null) throw new Error('Committed dispatch depends on the switching plan.')
  if (!plan.edges.some(edge => edge.id === id)) throw new Error('Switch was not found.')
  const edges = plan.edges.map(edge => edge.id === id ? { ...edge, closed: !edge.closed } : edge)
  if (restorationFindings(edges).some(item => item.includes('synchronizing permit'))) throw new Error('A synchronizing permit is required.')
  const revision = plan.revision + 1
  return { ...plan, edges, revision, dispatchRequests: plan.dispatchRequests?.map(item => item.status === 'open' ?
    { ...item, status: 'stale' as const } : item),
    history: [...plan.history, { revision, action: 'switch-position', affected: id }] }
}
export function commitDispatch(plan: SwitchingPlan, mw: number): SwitchingPlan {
  if (dispatchBlockers(plan).length) throw new Error('Topology has unresolved restoration findings.')
  if (!Number.isFinite(mw) || mw < 0 || mw > 22) throw new Error('Dispatch exceeds secure battery reserve.')
  if (plan.dispatchMw !== null) throw new Error('Dispatch interval is already committed.')
  const revision = plan.revision + 1
  return { ...plan, dispatchMw: mw, revision, history: [...plan.history, { revision, action: 'dispatch-committed', affected: 'F-12' }] }
}
export function commitDispatchAtRevision(plan: SwitchingPlan, mw: number, expectedRevision: number, actor: string, controllerId?: string): SwitchingPlan {
  const decision = dispatchApprovalPolicy(plan, actor, expectedRevision)
  if (!decision.allowed) throw new Error(decision.blockers[0])
  if (plan.dispatchRequests?.length) {
    const request = controlInbox(plan, actor).find(item => item.sourceRevision === expectedRevision && item.mw === mw)
    if (!request) throw new Error('A current dispatch request must be assigned to this approver.')
    if (request.assigneeId && request.assigneeId !== controllerId) throw new Error('Dispatch request belongs to another named controller.')
    const committed = commitDispatch(plan, mw)
    return { ...committed, dispatchRequests: plan.dispatchRequests.map(item => item.id === request.id ?
      { ...item, status: 'completed' as const } : item) }
  }
  return commitDispatch(plan, mw)
}
export function cancelDispatch(plan: SwitchingPlan, reason: string): SwitchingPlan {
  if (plan.dispatchMw === null) throw new Error('No committed dispatch exists.')
  if (reason.trim().length < 12) throw new Error('Explain why dispatch is cancelled.')
  const revision = plan.revision + 1
  return { ...plan, revision, dispatchMw: null, history: [...plan.history,
    { revision, action: 'dispatch-cancelled', affected: reason }] }
}
export function saveSwitchingPlan(storage: StoragePort, plan: SwitchingPlan): SwitchingPlan {
  storage.setItem(key, JSON.stringify(plan))
  return plan
}
