import { SelectedRecordRoute } from './SelectedRecordRoute'
import { useRecordContext } from '../../workspace/RecordScope'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { energizedNodes, gridLoads, restorationFindings } from './restoration'
import { changeSwitch, readSwitchingPlan, saveSwitchingPlan } from './switchingLedger'
function RecordContent() {
  const { storage, guard, recordId } = useRecordContext()

  const { station } = useParams()
  const [plan, setPlan] = useState(() => readSwitchingPlan(storage))
  const edges = plan.edges
  const [notice, setNotice] = useState('')
  const nodes = energizedNodes(edges)
  const findings = restorationFindings(edges)
  function switchEdge(id: string) {
    try {
      const next = saveSwitchingPlan(storage, changeSwitch(plan, id))
      setPlan(next)
      setNotice(`${id} updated. ${String(restorationFindings(next.edges).length)} finding(s) remain.`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Switch rejected.') }
  }
  return <div className="suite-page">
    <header className="suite-title"><div><small>RESTORATION / LIVE TOPOLOGY</small>
      <h1>Topology-aware operations graph</h1>
      <p>Substation {station ?? 'SS-NORTH'} · Evaluate reachability before changing switch positions.</p>
    </div></header>
    <section className="suite-card" aria-label="Grid topology">
      <h2>Feeder {recordId} · N-1 secure planning target</h2>
      <p>Switching revision {plan.revision} · Dispatch {plan.dispatchMw === null ? 'not committed' : String(plan.dispatchMw) + ' MW committed'}</p>
      <ul>{edges.map(edge => <li key={edge.id}>
        <strong>{edge.id}</strong> · {edge.from} → {edge.to} · {edge.capacityMw} MW · {edge.closed ? 'Closed' : 'Open'}
        <button onClick={guard(() => { switchEdge(edge.id); })} aria-label={`Toggle ${edge.id}`}>Change position</button>
      </li>)}</ul>
    </section>
    <section className="suite-card" aria-label="Load restoration">
      <h2>Served loads</h2>
      <table><thead><tr><th scope="col">Load</th><th scope="col">Demand</th><th scope="col">State</th></tr></thead>
        <tbody>{gridLoads.map(load => <tr key={load.node}><th scope="row">{load.node}</th>
          <td>{load.demandMw} MW</td><td>{nodes.has(load.node) ? 'Energized' : 'Isolated'}{load.critical && ' · Critical'}</td>
        </tr>)}</tbody></table>
      <h3>Safety findings</h3>
      {findings.length ? <ul>{findings.map(item => <li key={item}>{item}</li>)}</ul> : <p>All modeled loads are energized within transfer limits.</p>}
      <p role="status">{notice}</p>
    </section>
  </div>
}

export function TopologyOperationsGraphPage() { return <SelectedRecordRoute><RecordContent /></SelectedRecordRoute> }
