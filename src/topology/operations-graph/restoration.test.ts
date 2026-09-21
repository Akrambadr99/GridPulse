import { describe, expect, it } from 'vitest'
import { energizedNodes, gridEdges, restorationFindings } from './restoration'

describe('topology restoration', () => {
  it('reaches the district but not the isolated hospital', () => {
    expect([...energizedNodes(gridEdges)]).toEqual(['SS-NORTH', 'F-12', 'DISTRICT'])
    expect(restorationFindings(gridEdges)).toContain('HOSPITAL remains isolated (critical).')
  })
  it('restores the critical load when its switch closes', () => {
    const plan = gridEdges.map(edge => edge.id === 'SW-2' ? { ...edge, closed: true } : edge)
    expect(energizedNodes(plan).has('HOSPITAL')).toBe(true)
    expect(restorationFindings(plan)).toEqual([])
  })
  it('blocks an unsynchronized double feed', () => {
    const plan = gridEdges.map(edge => ({ ...edge, closed: true }))
    expect(restorationFindings(plan)).toContain('SW-2 and TIE-8 cannot be closed together without a synchronizing permit.')
  })
  it('reports an overloaded transfer edge', () => {
    const plan = gridEdges.map(edge => edge.id === 'SW-2' ? { ...edge, closed: true, capacityMw: 5 } : edge)
    expect(restorationFindings(plan)).toContain('SW-2 exceeds its transfer capacity.')
  })
})
