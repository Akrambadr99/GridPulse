import { describe, expect, it } from 'vitest'
import { MemoryStorage } from '../../data/memory-storage'
import { cancelDispatch, changeSwitch, commitDispatch, commitDispatchAtRevision, dispatchApprovalPolicy, dispatchBlockers, evaluateDispatchRevision, readSwitchingPlan, saveSwitchingPlan } from './switchingLedger'
describe('durable switching and dispatch', () => {
  it('persists a switch transition that changes dispatch eligibility', () => {
    const storage = new MemoryStorage()
    expect(dispatchBlockers(readSwitchingPlan(storage))).toContain('HOSPITAL remains isolated (critical).')
    saveSwitchingPlan(storage, changeSwitch(readSwitchingPlan(storage), 'SW-2'))
    expect(dispatchBlockers(readSwitchingPlan(storage))).toEqual([])
  })
  it('protects committed dispatch from topology reversal', () => {
    const storage = new MemoryStorage()
    saveSwitchingPlan(storage, changeSwitch(readSwitchingPlan(storage), 'SW-2'))
    const committed = saveSwitchingPlan(storage, commitDispatch(readSwitchingPlan(storage), 8))
    expect(committed.history.map(item => item.action)).toEqual(['switch-position', 'dispatch-committed'])
    expect(() => changeSwitch(committed, 'SW-2')).toThrow(/depends/)
    expect(readSwitchingPlan(storage).dispatchMw).toBe(8)
  })
  it('reports reviewed-topology conflicts and permits cancellation before a new switch plan', () => {
    const reviewed = readSwitchingPlan(new MemoryStorage())
    const changed = changeSwitch(reviewed, 'SW-2')
    expect(evaluateDispatchRevision(changed, reviewed.revision)).toMatchObject({ allowed: false, resolutionOptions: ['Review current topology'] })
    expect(() => commitDispatchAtRevision(changed, 8, reviewed.revision, 'control approver')).toThrow(/Topology changed/)
    expect(dispatchApprovalPolicy(changed, 'switching author', changed.revision)).toMatchObject({ allowed: false, queue: 'control-review' })
    const committed = commitDispatchAtRevision(changed, 8, changed.revision, 'control approver')
    const cancelled = cancelDispatch(committed, 'Operator cancelled the dispatch interval.')
    expect(cancelled.dispatchMw).toBeNull()
    expect(changeSwitch(cancelled, 'SW-2').revision).toBe(cancelled.revision + 1)
  })
})
