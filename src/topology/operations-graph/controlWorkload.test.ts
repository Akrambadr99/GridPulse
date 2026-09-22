import { describe, expect, it } from 'vitest'
import { changeSwitch, commitDispatchAtRevision, initialSwitchingPlan, requestDispatch } from './switchingLedger'
import { claimControlRequest, controlEligibility, controlWorkInbox, controlWorkload, directAssignCritical, releaseControlClaim } from './controlWorkload'

function ready(mw: number) {
  return requestDispatch(changeSwitch(initialSwitchingPlan, 'SW-2'), mw)
}

describe('multi-feeder control workload', () => {
  it('prioritizes critical dispatch and enforces ratings and cross-feeder capacity', () => {
    const routine = ready(8)
    const critical = ready(18)
    const records = [{ feederId: 'F-12', plan: routine }, { feederId: 'F-13', plan: critical }]
    expect(controlWorkInbox(records).map(item => item.mw)).toEqual([18, 8])
    expect(controlEligibility(records, 'F-12', 18, 'control-samir')).toContain('Engineer lacks dispatch rating.')
    const claimed = claimControlRequest(records[0]!, 'control-samir', records, routine.revision)
    expect(controlWorkload([{ ...records[0]!, plan: claimed }, records[1]!], 'control-samir')).toBe(1)
    expect(() => claimControlRequest({ feederId: 'F-12', plan: routine }, 'control-samir',
      [{ feederId: 'F-12', plan: claimed }], routine.revision)).toThrow(/at capacity/)
    expect(() => claimControlRequest(records[1]!, 'control-ada', records, critical.revision)).toThrow(/direct supervisor/)
    const assigned = directAssignCritical(records[1]!, 'control-ada', 'control supervisor',
      'Critical hospital feeder requires direct assignment.', records)
    expect(() => releaseControlClaim(assigned, 'control-ada')).toThrow(/Critical/)
    expect(commitDispatchAtRevision(assigned, 18, assigned.revision, 'control approver', 'control-ada').dispatchMw).toBe(18)
  })

  it('cannot execute a claimed request after topology revision', () => {
    const routine = ready(8)
    const claimed = claimControlRequest({ feederId: 'F-12', plan: routine }, 'control-ada', [], routine.revision)
    const stale = changeSwitch(claimed, 'SW-3')
    expect(controlWorkInbox([{ feederId: 'F-12', plan: stale }])[0]?.actionable).toBe(false)
    expect(() => commitDispatchAtRevision(stale, 8, claimed.revision, 'control approver', 'control-ada')).toThrow()
  })
})
