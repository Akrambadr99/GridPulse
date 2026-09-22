import { describe, expect, it } from 'vitest'
import { MemoryStorage } from '../../data/memory-storage'
import { changeSwitch, commitDispatch, dispatchBlockers, readSwitchingPlan, saveSwitchingPlan } from './switchingLedger'
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
})
