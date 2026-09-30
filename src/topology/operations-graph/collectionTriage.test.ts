import { describe, expect, it } from 'vitest'
import { feederTriage } from './collectionTriage'
import { assignFeederControl, feederById, seedFeederCollection } from './feederCollection'

describe('feeder collection triage', () => {
  it('distinguishes critical and routine unclaimed dispatches', () => {
    const state = seedFeederCollection()
    expect(feederTriage.state(feederById(state, 'F-14'))).toBe('critical')
    expect(feederTriage.state(feederById(state, 'F-13'))).toBe('unclaimed')
    expect(feederTriage.state(feederById(state, 'F-22'))).toBe('no-dispatch')
  })
  it('updates current assignment after an eligible control claim', () => {
    const state = seedFeederCollection()
    const next = assignFeederControl(state, 'F-13', 'control-ada', feederById(state, 'F-13').plan.revision)
    expect(feederTriage.state(feederById(next, 'F-13'))).toBe('assigned')
    expect(feederTriage.state(feederById(state, 'F-13'))).toBe('unclaimed')
  })
  it('does not mistake an outdated critical request for current work', () => {
    const record = feederById(seedFeederCollection(), 'F-14')
    expect(feederTriage.state({ ...record, plan: { ...record.plan, revision: 99 } })).toBe('stale')
  })
  it('recognizes committed dispatch without inventing a new request', () => {
    const record = feederById(seedFeederCollection(), 'F-22')
    expect(feederTriage.state({ ...record, plan: { ...record.plan, dispatchMw: 8 } })).toBe('committed')
  })
  it('searches outage-group identity without mutating the plan', () => {
    const record = feederById(seedFeederCollection(), 'F-13')
    const before = JSON.stringify(record)
    expect(feederTriage.searchText(record)).toBe('F-13 OUT-NORTH')
    expect(feederTriage.revision(record)).toBe(record.plan.revision)
    expect(feederTriage.states.some(item => item.value === feederTriage.state(record))).toBe(true)
    expect(JSON.stringify(record)).toBe(before)
  })
})
