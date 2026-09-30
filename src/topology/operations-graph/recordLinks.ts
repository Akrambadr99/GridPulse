import type { FeederCollection } from './feederCollection'

type Record = FeederCollection['feeders'][number]
function selected(path: string, id: string) { return path + (path.includes('?') ? '&' : '?') + 'record=' + encodeURIComponent(id) }
export function recordDetailPath(record: Record) { return selected('/grid/topology/SS-NORTH', record.id) }
export function recordDecisionPath(record: Record) { return selected('/grid/topology/SS-NORTH/dispatch/18:00', record.id) }
