import { requireThat } from '../workspace/values'
export const workflowKey = "reserve-dispatch"
export const workflowLabel = "Operating reserve dispatch"
export const ruleKind = "reserve"
export interface ReserveDispatchRecord { measured: number; limit: number; evidence: string; revision: number }
export function validateAuthorization(record: ReserveDispatchRecord) {
  requireThat(Number.isSafeInteger(record.measured) && Number.isSafeInteger(record.limit), 'Workflow measurements must be safe integers.')
  requireThat(record.measured >= 0 && record.limit >= 0, 'Workflow measurements cannot be negative.')
  requireThat(record.measured >= record.limit, 'Available reserve MW fall below Minimum reserve MW.')
  requireThat(record.evidence.trim().length >= 8, 'Operating reserve dispatch require traceable evidence.')
  requireThat(record.revision > 0, 'Operating reserve dispatch require a current record revision.')
  return { authorized: true as const, fingerprint: [workflowKey, record.measured, record.limit, record.revision].join(':') }
}
export function canRoleAdvance(role: string, phase: string) {
  const matrix: Record<string, readonly string[]> = { draft: ['coordinator'], review: ['reviewer'], authorized: ['operator'], active: ['owner'], blocked: ['reviewer'] }
  return (matrix[phase] ?? []).includes(role)
}
