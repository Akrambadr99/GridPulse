import { describe, expect, it } from 'vitest'
import { archiveFeeder, assignFeederControl, createFeeder, feederById, feederInbox, readFeederCollection,
  requestFeederDispatches, reviseOutageGroup, saveFeederCollection, seedFeederCollection } from './feederCollection'

function storage() { const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } } }
describe('persisted feeder dispatch collection', () => {
  it('contains independent plans and priority-ordered control work', () => {
    const state = seedFeederCollection()
    expect(state.feeders).toHaveLength(6)
    expect(feederInbox(state).map(item => item.feederId)).toEqual(['F-14', 'F-13', 'F-21'])
    expect(feederById(state, 'F-13').plan.edges.find(edge => edge.id === 'SW-1')?.to).toBe('F-13')
  })
  it('assigns an eligible feeder and preserves blocked critical scope', () => {
    const port = storage(); const state = seedFeederCollection()
    const next = assignFeederControl(state, 'F-13', 'control-ada', feederById(state, 'F-13').plan.revision)
    saveFeederCollection(port, next)
    expect(feederInbox(readFeederCollection(port)).find(item => item.feederId === 'F-13')?.assigneeId).toBe('control-ada')
    expect(feederInbox(readFeederCollection(port)).find(item => item.feederId === 'F-14')?.assigneeId).toBeNull()
    expect(() => assignFeederControl(state, 'F-14', 'control-ada', feederById(state, 'F-14').plan.revision)).toThrow('outside feeder scope')
    expect(() => assignFeederControl(state, 'F-21', 'control-ada', feederById(state, 'F-21').plan.revision)).toThrow('outside feeder scope')
  })
  it('revises only outage-group members, staling their current requests', () => {
    const state = seedFeederCollection(); const result = reviseOutageGroup(state, 'OUT-NORTH', 1)
    expect(result.updated).toEqual(['F-12', 'F-13', 'F-14'])
    expect(feederById(result.collection, 'F-13').plan.dispatchRequests?.at(-1)?.status).toBe('stale')
    expect(feederById(result.collection, 'F-21').plan.revision).toBe(feederById(state, 'F-21').plan.revision)
    expect(() => reviseOutageGroup(result.collection, 'OUT-NORTH', 1)).toThrow('revision changed')
  })
  it('reports selected partial outcomes and blocks archive of dispatch work', () => {
    const state = seedFeederCollection(); const result = requestFeederDispatches(state, ['F-13', 'F-22', 'F-23', 'missing'], 10)
    expect(result.updated).toEqual(['F-22'])
    expect(result.skipped).toEqual(['F-23'])
    expect(result.blocked.map(item => item.id)).toEqual(['F-13', 'missing'])
    expect(() => archiveFeeder(state, 'F-13')).toThrow('open or committed')
    const created = createFeeder(state, 'F-15', 'OUT-NORTH')
    expect(created.groups.find(item => item.id === 'OUT-NORTH')?.feederIds).toContain('F-15')
    expect(archiveFeeder(created, 'F-15').feeders.find(item => item.id === 'F-15')?.archived).toBe(true)
  })
})
