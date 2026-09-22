import type { StoragePort } from '../../workspace/repository'
import { gridEdges, restorationFindings } from './restoration'
import type { GridEdge } from './restoration'

export interface SwitchingPlan {
  edges: readonly GridEdge[]
  dispatchMw: number | null
  revision: number
  history: readonly { revision: number; action: string; affected: string }[]
}
const key = 'gridpulse:switching-plan:v1'
export const initialSwitchingPlan: SwitchingPlan = { edges: gridEdges, dispatchMw: null, revision: 0, history: [] }
export function readSwitchingPlan(storage: StoragePort): SwitchingPlan {
  const raw = storage.getItem(key)
  if (!raw) return initialSwitchingPlan
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !('edges' in value) || !Array.isArray(value.edges) ||
    !('dispatchMw' in value) || (value.dispatchMw !== null && typeof value.dispatchMw !== 'number') ||
    !('revision' in value) || typeof value.revision !== 'number' ||
    !('history' in value) || !Array.isArray(value.history)) throw new Error('Invalid switching-plan record.')
  return value as SwitchingPlan
}
export function dispatchBlockers(plan: SwitchingPlan): string[] {
  return restorationFindings(plan.edges)
}
export function changeSwitch(plan: SwitchingPlan, id: string): SwitchingPlan {
  if (plan.dispatchMw !== null) throw new Error('Committed dispatch depends on the switching plan.')
  if (!plan.edges.some(edge => edge.id === id)) throw new Error('Switch was not found.')
  const edges = plan.edges.map(edge => edge.id === id ? { ...edge, closed: !edge.closed } : edge)
  if (restorationFindings(edges).some(item => item.includes('synchronizing permit'))) throw new Error('A synchronizing permit is required.')
  const revision = plan.revision + 1
  return { ...plan, edges, revision, history: [...plan.history, { revision, action: 'switch-position', affected: id }] }
}
export function commitDispatch(plan: SwitchingPlan, mw: number): SwitchingPlan {
  if (dispatchBlockers(plan).length) throw new Error('Topology has unresolved restoration findings.')
  if (!Number.isFinite(mw) || mw < 0 || mw > 22) throw new Error('Dispatch exceeds secure battery reserve.')
  if (plan.dispatchMw !== null) throw new Error('Dispatch interval is already committed.')
  const revision = plan.revision + 1
  return { ...plan, dispatchMw: mw, revision, history: [...plan.history, { revision, action: 'dispatch-committed', affected: 'F-12' }] }
}
export function saveSwitchingPlan(storage: StoragePort, plan: SwitchingPlan): SwitchingPlan {
  storage.setItem(key, JSON.stringify(plan))
  return plan
}
