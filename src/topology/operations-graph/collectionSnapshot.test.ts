import { describe, expect, it, vi } from 'vitest'
import { compareCollectionSnapshot, createCollectionSnapshot } from '../../workspace/collectionSnapshot'
import { collectionSnapshotAdapter as adapter } from './collectionSnapshot'
import { createFeeder, seedFeederCollection } from './feederCollection'

const key = 'gridpulse:feeder-collection:v1'
const createdAt = '2026-09-30T12:00:00.000Z'
function storage(raw: string | null = null) {
  const values = new Map<string, string>(raw === null ? [] : [[key, raw]])
  values.set('unrelated:workflow', 'preserve this value')
  return { values, getItem: (id: string) => values.get(id) ?? null,
    setItem: vi.fn((id: string, value: string) => { values.set(id, value) }) }
}
function snapshot(payload: unknown, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ format: 'collection-snapshot', version: 1, product: adapter.product,
    scope: adapter.scope, createdAt, payload, ...extra })
}

describe('GridPulse primary collection snapshot adapter', () => {
  it('exports the complete primary collection, archived work and metadata without storage writes', () => {
    const collection = { ...seedFeederCollection(), sourceMetadata: { note: 'preserved evidence' } }
    const raw = JSON.stringify(collection); const port = storage(raw)
    expect(JSON.parse(createCollectionSnapshot(adapter, port, createdAt))).toEqual({
      format: 'collection-snapshot', version: 1, product: 'GridPulse', scope: 'feeder-collection', createdAt, payload: collection,
    })
    expect(collection.feeders.some(record => record.archived)).toBe(true)
    expect(port.values.get(key)).toBe(raw)
    expect(port.values.get('unrelated:workflow')).toBe('preserve this value')
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('reviews a seeded collection without materializing new saved data', () => {
    const port = storage()
    const result = compareCollectionSnapshot(createCollectionSnapshot(adapter, port, createdAt), adapter, port)
    expect(result.payloadChanged).toBe(false)
    expect(result.rows).toHaveLength(8)
    expect(result.rows.every(row => row.status === 'unchanged')).toBe(true)
    expect(port.values.has(key)).toBe(false)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('includes independently keyed parent records rather than only the operational rows', () => {
    const groups = adapter.groups(seedFeederCollection())
    expect(groups.map(group => group.key)).toEqual(['feeders', 'groups'])
    expect(groups.flatMap(group => group.records).map(record => record.id)).toContain('OUT-NORTH')
    expect(groups.flatMap(group => group.records).map(record => record.id)).toContain('F-13')
  })

  it('detects nested history changes even when the operational revision is unchanged', () => {
    const seed = seedFeederCollection()
    const candidate = { ...seed, feeders: seed.feeders.map(record => record.id === 'F-13' ? {
      ...record, plan: { ...record.plan, history: record.plan.history.map((event, index) =>
        index === 0 ? { ...event, affected: 'Updated supporting evidence' } : event) },
    } : record) }
    const port = storage(JSON.stringify(seed))
    const result = compareCollectionSnapshot(snapshot(candidate), adapter, port)
    expect(result.rows.find(row => row.id === 'F-13')?.status).toBe('changed')
    expect(result.rows.filter(row => row.status === 'changed')).toHaveLength(1)
    expect(result.payloadChanged).toBe(true)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('detects parent-only changes and additions with unchanged surrounding records', () => {
    const seed = seedFeederCollection(); const port = storage(JSON.stringify(seed))
    const parentOnly = { ...seed, groups: seed.groups.map(record => record.id === 'OUT-NORTH' ?
      { ...record, revision: record.revision + 1 } : record) }
    expect(compareCollectionSnapshot(snapshot(parentOnly), adapter, port).rows.find(row => row.id === 'OUT-NORTH')?.status).toBe('changed')
    const added = compareCollectionSnapshot(snapshot(createFeeder(seed, 'F-15', 'OUT-NORTH')), adapter, port)
    expect(added.rows.filter(row => row.status === 'added')).toHaveLength(1)
    expect(added.rows.filter(row => row.status === 'changed')).toHaveLength(1)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('reports audit and collection metadata differences without inventing repeating audit row identities', () => {
    const seed = seedFeederCollection(); const port = storage(JSON.stringify(seed))
    const candidate = { ...seed, audit: [
      { action: 'review-note', id: 'F-13', related: [] }, { action: 'review-note', id: 'F-13', related: [] },
    ], sourceMetadata: { reviewed: true } }
    const result = compareCollectionSnapshot(snapshot(candidate), adapter, port)
    expect(result.payloadChanged).toBe(true)
    expect(result.rows).toHaveLength(8)
    expect(result.rows.every(row => row.status === 'unchanged')).toBe(true)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('rejects malformed nested data, duplicate identities and broken parent membership without writes', () => {
    const seed = seedFeederCollection(); const raw = JSON.stringify(seed); const port = storage(raw)
    for (const candidate of [{ ...seed, feeders: [null] }, { ...seed, feeders: [...seed.feeders, seed.feeders[0]] }, { ...seed, groups: seed.groups.map(record => ({ ...record, feederIds: [] })) }]) {
      expect(() => compareCollectionSnapshot(snapshot(candidate), adapter, port)).toThrow()
    }
    expect(port.values.get(key)).toBe(raw)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('rejects other products, scopes, versions and truncated text without writes', () => {
    const seed = seedFeederCollection(); const port = storage(JSON.stringify(seed))
    for (const raw of [snapshot(seed, { product: 'DifferentProduct' }), snapshot(seed, { scope: 'unrelated' }),
      snapshot(seed, { version: 99 }), '{private truncated JSON']) {
      expect(() => compareCollectionSnapshot(raw, adapter, port)).toThrow()
    }
    expect(port.setItem).not.toHaveBeenCalled()
    expect(port.values.get('unrelated:workflow')).toBe('preserve this value')
  })

  it('does not turn corrupt current storage into an apparently valid empty export', () => {
    const port = storage('{private damaged current collection')
    expect(() => createCollectionSnapshot(adapter, port, createdAt)).toThrow()
    expect(port.values.get(key)).toBe('{private damaged current collection')
    expect(port.setItem).not.toHaveBeenCalled()
  })
})
