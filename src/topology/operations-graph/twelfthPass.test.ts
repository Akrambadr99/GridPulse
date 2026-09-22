import { describe, expect, it } from 'vitest'
import { changeSwitch, commitDispatchAtRevision, controlInbox, initialSwitchingPlan, requestDispatch } from './switchingLedger'

describe('control dispatch worklist', () => {
  it('stales a requested revision after a switch change', () => {
    const ready = changeSwitch(initialSwitchingPlan, 'SW-2')
    const requested = requestDispatch(ready, 8)
    expect(controlInbox(requested, 'control approver')).toHaveLength(1)
    const changed = changeSwitch(requested, 'SW-3')
    expect(controlInbox(changed, 'control approver')).toHaveLength(0)
    expect(() => commitDispatchAtRevision(changed, 8, requested.revision, 'control approver')).toThrow()
  })
})
