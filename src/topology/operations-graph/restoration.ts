export interface GridEdge { id: string; from: string; to: string; closed: boolean; capacityMw: number }
export interface GridLoad { node: string; demandMw: number; critical: boolean }
export const gridEdges: readonly GridEdge[] = [
  { id: 'SW-1', from: 'SS-NORTH', to: 'F-12', closed: true, capacityMw: 12 },
  { id: 'SW-2', from: 'F-12', to: 'HOSPITAL', closed: false, capacityMw: 7 },
  { id: 'SW-3', from: 'F-12', to: 'DISTRICT', closed: true, capacityMw: 5 },
  { id: 'TIE-8', from: 'SS-SOUTH', to: 'HOSPITAL', closed: false, capacityMw: 6 },
]
export const gridLoads: readonly GridLoad[] = [
  { node: 'HOSPITAL', demandMw: 6, critical: true },
  { node: 'DISTRICT', demandMw: 4, critical: false },
]

export function energizedNodes(edges: readonly GridEdge[], source = 'SS-NORTH'): Set<string> {
  const found = new Set([source])
  let changed = true
  while (changed) {
    changed = false
    for (const edge of edges) {
      if (!edge.closed) continue
      if (found.has(edge.from) && !found.has(edge.to)) { found.add(edge.to); changed = true }
      if (found.has(edge.to) && !found.has(edge.from)) { found.add(edge.from); changed = true }
    }
  }
  return found
}

export function restorationFindings(edges: readonly GridEdge[], loads = gridLoads): string[] {
  const reachable = energizedNodes(edges)
  const findings: string[] = []
  for (const load of loads) {
    if (!reachable.has(load.node)) findings.push(`${load.node} remains isolated${load.critical ? ' (critical)' : ''}.`)
  }
  for (const edge of edges.filter(item => item.closed)) {
    const downstream = loads.filter(load => reachable.has(load.node) && load.node === edge.to)
    if (downstream.reduce((total, load) => total + load.demandMw, 0) > edge.capacityMw) {
      findings.push(`${edge.id} exceeds its transfer capacity.`)
    }
  }
  if (edges.find(edge => edge.id === 'SW-2')?.closed && edges.find(edge => edge.id === 'TIE-8')?.closed) {
    findings.push('SW-2 and TIE-8 cannot be closed together without a synchronizing permit.')
  }
  return findings
}
