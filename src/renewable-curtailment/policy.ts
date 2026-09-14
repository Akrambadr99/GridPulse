import { requireThat } from '../workspace/values'
export const workflowKey = "renewable-curtailment"
export const workflowLabel = "Renewable curtailment"
export const ruleKind = "threshold"
export interface RenewableCurtailmentRecord { measured: number; limit: number; evidence: string; revision: number }
export function validateAuthorization(record: RenewableCurtailmentRecord) {
  requireThat(Number.isSafeInteger(record.measured) && Number.isSafeInteger(record.limit), 'Workflow measurements must be safe integers.')
  requireThat(record.measured >= 0 && record.limit >= 0, 'Workflow measurements cannot be negative.')
  requireThat(record.measured <= record.limit, 'Forecast imbalance MW exceed Maximum tolerated imbalance MW.')
  requireThat(record.evidence.trim().length >= 8, 'Renewable curtailment require traceable evidence.')
  requireThat(record.revision > 0, 'Renewable curtailment require a current record revision.')
  return { authorized: true as const, fingerprint: [workflowKey, record.measured, record.limit, record.revision].join(':') }
}
export function canRoleAdvance(role: string, phase: string) {
  const matrix: Record<string, readonly string[]> = { draft: ['coordinator'], review: ['reviewer'], authorized: ['operator'], active: ['owner'], blocked: ['reviewer'] }
  return (matrix[phase] ?? []).includes(role)
}
