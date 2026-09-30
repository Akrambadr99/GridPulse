import { describe, expect, it, vi } from 'vitest'
import { StoredDataError } from '../../workspace/storageValidation'
import { feederCollectionRule } from './collectionValidation'
import { changeSwitch, commitDispatchAtRevision, dispatchBlockers, initialSwitchingPlan, requestDispatch } from './switchingLedger'
import { archiveFeeder, createFeeder, feederById, readFeederCollection, reviseOutageGroup,
  saveFeederCollection, seedFeederCollection } from './feederCollection'

const key = 'gridpulse:feeder-collection:v1'
const legacyKey = 'gridpulse:switching-plan:v1'
function storage(entries: [string, string][] = []) {
  const values = new Map(entries)
  return { values, getItem: (id: string) => values.get(id) ?? null,
    setItem: vi.fn((id: string, raw: string) => { values.set(id, raw) }) }
}
function changed(path: string, value: unknown) {
  const collection = structuredClone(seedFeederCollection())
  const segments = path.split('.'); const field = segments.pop()
  if (!field) throw new Error('A fixture path is required.')
  let parent: unknown = collection
  for (const segment of segments) parent = (parent as Record<string, unknown>)[segment]
  ;(parent as Record<string, unknown>)[field] = value
  return collection
}

describe('feeder collection storage integrity', () => {
  it.each([
    ['feeders.0', null], ['feeders.0.plan', null], ['feeders.1.plan.dispatchRequests.0', null],
    ['feeders.1.plan.dispatchRequests', {}], ['feeders.1.plan.dispatchRequests.0.status', 'PRIVATE-INVALID-STATE'],
    ['feeders.1.plan.dispatchRequests.0.assigneeId', 42], ['feeders.1.plan.dispatchRequests.0.mw', '8'],
    ['feeders.1.plan.dispatchRequests.0.sourceRevision', -1], ['feeders.0.plan.revision', 0.5],
    ['feeders.0.plan.dispatchMw', '0'], ['feeders.0.plan.edges.0', null], ['feeders.0.plan.edges.0.closed', 'false'],
    ['feeders.0.plan.edges.0.capacityMw', null], ['feeders.1.plan.history.0', null],
    ['feeders.1.plan.history.0.affected', false], ['feeders.0.archived', null], ['groups.0', null],
    ['groups.0.feederIds.0', false], ['feeders.0.outageGroupId', 'missing'], ['groups.0.feederIds', []], ['audit', [null]],
  ])('rejects malformed %s without changing saved text', (path, value) => {
    const raw = JSON.stringify(changed(path, value)); const port = storage([[key, raw]])
    expect(() => readFeederCollection(port)).toThrow(StoredDataError)
    expect(() => readFeederCollection(port)).not.toThrow('PRIVATE-INVALID-STATE')
    expect(port.values.get(key)).toBe(raw); expect(port.setItem).not.toHaveBeenCalled()
  })

  it('rejects duplicate feeder, group, membership, edge and dispatch identities', () => {
    const seed = seedFeederCollection()
    const candidates = [
      { ...seed, feeders: [...seed.feeders, seed.feeders[0]] }, { ...seed, groups: [...seed.groups, seed.groups[0]] },
      changed('groups.0.feederIds', ['F-12', 'F-12']),
      changed('feeders.0.plan.edges', Array(2).fill(seed.feeders[0]?.plan.edges[0])),
      changed('feeders.1.plan.dispatchRequests', Array(2).fill(seed.feeders[1]?.plan.dispatchRequests?.[0])),
    ]
    for (const value of candidates) expect(() => readFeederCollection(storage([[key, JSON.stringify(value)]]))).toThrow('duplicate')
  })

  it.each(['', '{private damaged data'])('preserves unreadable primary text instead of seeding: %j', raw => {
    const port = storage([[key, raw]])
    expect(() => readFeederCollection(port)).toThrow(StoredDataError)
    expect(port.values.get(key)).toBe(raw); expect(port.setItem).not.toHaveBeenCalled()
  })

  it('roundtrips optional request fields and unknown metadata unchanged', () => {
    const value = changed('feeders.0.plan.dispatchRequests', undefined)
    Object.assign(value, { importMetadata: { source: 'control archive', version: 7 } })
    Object.assign(feederById(value, 'F-13').plan, { sourceNote: ['retained', 123] })
    const raw = JSON.stringify(value); const port = storage([[key, raw]])
    const loaded = readFeederCollection(port)
    expect(feederCollectionRule(loaded)).toBe(loaded)
    expect(saveFeederCollection(port, loaded)).toBe(loaded)
    expect(port.values.get(key)).toBe(raw)
  })

  it('validates legacy migration output while retaining supported normalization', () => {
    const legacy = { edges: initialSwitchingPlan.edges, dispatchMw: null, revision: 0, history: [], sourceNote: 'kept' }
    const raw = JSON.stringify(legacy); const port = storage([[legacyKey, raw]])
    expect(feederById(readFeederCollection(port), 'F-12').plan).toEqual({ ...legacy, switchOwner: 'switching author', dispatchRequests: [] })
    expect(port.values.get(legacyKey)).toBe(raw); expect(port.setItem).not.toHaveBeenCalled()
    const malformed = JSON.stringify({ ...initialSwitchingPlan, edges: [null] }); const damaged = storage([[legacyKey, malformed]])
    expect(() => readFeederCollection(damaged)).toThrow(expect.objectContaining({ key: legacyKey, operation: 'read' }))
    expect(damaged.values.get(legacyKey)).toBe(malformed); expect(damaged.setItem).not.toHaveBeenCalled()
  })

  it.each(['', '{private legacy data'])('reports the legacy recovery key for unreadable legacy text: %j', raw => {
    const port = storage([[legacyKey, raw]])
    expect(() => readFeederCollection(port)).toThrow(expect.objectContaining({ key: legacyKey, operation: 'read' }))
    expect(port.values.get(legacyKey)).toBe(raw); expect(port.setItem).not.toHaveBeenCalled()
  })

  it('rejects unchecked runtime saves before writing, including non-finite grid numbers', () => {
    const raw = JSON.stringify(seedFeederCollection()); const port = storage([[key, raw]])
    for (const value of [changed('feeders.0', null), changed('feeders.0.plan.edges.0.capacityMw', Infinity)]) {
      expect(() => saveFeederCollection(port, value)).toThrow(expect.objectContaining({ key, operation: 'write' }))
      expect(port.values.get(key)).toBe(raw); expect(port.setItem).not.toHaveBeenCalled()
    }
  })

  it('accepts unresolved topology, stale history, completed dispatch and archived feeders', () => {
    const seed = seedFeederCollection()
    expect(dispatchBlockers(feederById(seed, 'F-12').plan).length).toBeGreaterThan(0)
    const stale = reviseOutageGroup(seed, 'OUT-NORTH', 1).collection
    expect(feederById(stale, 'F-13').plan.dispatchRequests?.[0]?.status).toBe('stale')
    expect(feederCollectionRule(stale)).toBe(stale)
    const renewed = requestDispatch(changeSwitch(feederById(stale, 'F-13').plan, 'SW-2'), 8)
    expect(renewed.dispatchRequests?.map(item => item.status)).toEqual(['superseded', 'open'])
    const committed = commitDispatchAtRevision(renewed, 8, renewed.revision, 'control approver')
    const completed = { ...stale, feeders: stale.feeders.map(item => item.id === 'F-13' ? { ...item, plan: committed } : item) }
    const archived = archiveFeeder(createFeeder(completed, 'F-24', 'OUT-SOUTH'), 'F-24')
    const port = storage(); saveFeederCollection(port, archived)
    expect(readFeederCollection(port)).toEqual(archived)
  })
})
