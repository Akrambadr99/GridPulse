import { describe, expect, it } from 'vitest'
import type { StoragePort } from '../../workspace/repository'
import { saveCurrentCollection } from '../../workspace/recordStorage'
import { openSelectedRecord } from './selectedRecord'
import { readFeederCollection, saveFeederCollection } from './feederCollection'
import { readSwitchingPlan, saveSwitchingPlan, changeSwitch } from './switchingLedger'

class MemoryStorage implements StoragePort {
  data = new Map<string, string>()
  fail = false
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, raw: string) { if (this.fail) throw new Error('Storage full'); this.data.set(key, raw) }
}
const edit: (state: ReturnType<typeof readSwitchingPlan>) => ReturnType<typeof readSwitchingPlan> = state => changeSwitch(state, 'SW-2')
const key = 'gridpulse:switching-plan:v1'
describe('selected feeder persistence', () => {
  it('preserves the primary migration source when a secondary record opens first', () => {
    const storage = new MemoryStorage()
    const before = readFeederCollection(storage)
    const peer = before.feeders[1]
    if (!peer) throw new Error('Secondary fixture missing')
    const bound = openSelectedRecord(storage, peer.id)
    expect(readFeederCollection(bound)).toEqual(before)
    expect(storage.data.size).toBe(0)
  })
  it('imports legacy history once and retains its original backup', () => {
    const storage = new MemoryStorage()
    const legacy = edit(readSwitchingPlan(storage))
    saveSwitchingPlan(storage, legacy)
    const backup = storage.getItem(key)
    const bound = openSelectedRecord(storage)
    expect(readSwitchingPlan(bound)).toEqual(legacy)
    saveSwitchingPlan(bound, legacy)
    expect(readFeederCollection(storage).feeders[0]?.plan).toEqual(legacy)
    expect(storage.getItem(key)).toBe(backup)
    saveSwitchingPlan(storage, readSwitchingPlan(new MemoryStorage()))
    expect(readSwitchingPlan(openSelectedRecord(storage))).toEqual(legacy)
  })
  it('persists a domain action and preserves every unrelated record', () => {
    const storage = new MemoryStorage(), before = readFeederCollection(storage)
    const bound = openSelectedRecord(storage), changed = edit(readSwitchingPlan(bound))
    saveSwitchingPlan(bound, changed)
    const after = readFeederCollection(storage)
    expect(after.feeders[0]?.plan).toEqual(changed)
    expect(after.feeders.slice(1)).toEqual(before.feeders.slice(1))
    expect(readSwitchingPlan(openSelectedRecord(storage))).toEqual(changed)
    expect(after.audit.at(-1)).toMatchObject({ action: 'detail-updated', id: 'F-12' })
  })
  it('rejects stale edits without replacing the newer domain state', () => {
    const storage = new MemoryStorage()
    const first = openSelectedRecord(storage), stale = openSelectedRecord(storage)
    const changed = edit(readSwitchingPlan(first))
    saveSwitchingPlan(first, changed)
    expect(() => saveSwitchingPlan(stale, edit(readSwitchingPlan(stale)))).toThrow('changed in another view')
    expect(readSwitchingPlan(openSelectedRecord(storage))).toEqual(changed)
  })
  it('merges with an unrelated record archive without losing that edit', () => {
    const storage = new MemoryStorage(), bound = openSelectedRecord(storage)
    const before = readFeederCollection(storage), peer = before.feeders[1]
    if (!peer) throw new Error('Peer fixture missing')
    const newer = { ...before, feeders: before.feeders.map(item => item.id === peer.id ? { ...item, archived: true } : item) }
    saveFeederCollection(storage, newer)
    saveSwitchingPlan(bound, edit(readSwitchingPlan(bound)))
    expect(readFeederCollection(storage).feeders[1]).toEqual(newer.feeders[1])
  })
  it('rejects missing and archived targets without writing', () => {
    const storage = new MemoryStorage()
    expect(() => openSelectedRecord(storage, 'missing')).toThrow('not found')
    expect(storage.data.size).toBe(0)
    const before = readFeederCollection(storage)
    saveFeederCollection(storage, { ...before, feeders: before.feeders.map(item => ({ ...item, archived: true })) })
    const snapshot = [...storage.data]
    expect(() => openSelectedRecord(storage)).toThrow('archived')
    expect([...storage.data]).toEqual(snapshot)
  })
  it('rejects a record archived after the editor opened', () => {
    const storage = new MemoryStorage(), bound = openSelectedRecord(storage)
    const before = readFeederCollection(storage)
    saveFeederCollection(storage, { ...before, feeders: before.feeders.map(item => ({ ...item, archived: true })) })
    expect(() => saveSwitchingPlan(bound, edit(readSwitchingPlan(bound)))).toThrow('changed in another view')
  })
  it('preserves retryability after a recoverable storage failure', () => {
    const storage = new MemoryStorage(), bound = openSelectedRecord(storage)
    const changed = edit(readSwitchingPlan(bound))
    storage.fail = true
    expect(() => saveSwitchingPlan(bound, changed)).toThrow('Storage full')
    storage.fail = false
    saveSwitchingPlan(bound, changed)
    expect(readSwitchingPlan(openSelectedRecord(storage))).toEqual(changed)
  })
  it('protects a detail edit against a stale whole-workspace save', () => {
    const storage = new MemoryStorage(), stale = readFeederCollection(storage)
    const bound = openSelectedRecord(storage)
    saveSwitchingPlan(bound, edit(readSwitchingPlan(bound)))
    expect(() => saveCurrentCollection(storage, stale, stale, readFeederCollection, saveFeederCollection)).toThrow('Workspace changed')
    expect(readFeederCollection(storage).feeders[0]?.plan).not.toEqual(stale.feeders[0]?.plan)
  })
})
