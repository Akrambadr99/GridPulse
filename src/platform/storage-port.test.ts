import { describe, expect, expectTypeOf, it } from 'vitest'
import type { StoragePort, StorageReader, StorageWriter } from './storage-port'
import type { StoragePort as LegacyStoragePort } from '../workspace/repository'

describe('storage capabilities', () => {
  it('keeps the repository compatibility type structurally identical', () => {
    expectTypeOf<StoragePort>().toEqualTypeOf<LegacyStoragePort>()
    expectTypeOf<keyof StorageReader>().toEqualTypeOf<'getItem'>()
    expectTypeOf<keyof StorageWriter>().toEqualTypeOf<'setItem'>()
  })

  it('supports readers without a browser or mutation methods', () => {
    const reader: StorageReader = Object.freeze({ getItem: (key: string) => key === 'saved' ? 'value' : null })
    expect(reader.getItem('saved')).toBe('value')
    expect(reader.getItem('absent')).toBeNull()
    expect('setItem' in reader).toBe(false)
  })
})
