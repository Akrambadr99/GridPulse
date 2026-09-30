import { recordDetailPath, recordDecisionPath } from './recordLinks'
import { Link } from 'react-router-dom'
import { saveCurrentCollection } from '../../workspace/recordStorage'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { controlEngineers } from './controlWorkload'
import { archiveFeeder, assignFeederControl, createFeeder, feederInbox, feederRows, readFeederCollection,
  requestFeederDispatches, reviseOutageGroup, saveFeederCollection } from './feederCollection'

export function FeederCollectionPage() {
  const [collection, setCollection] = useState(() => readFeederCollection(window.localStorage))
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('active')
  const [controller, setController] = useState('control-ada'); const [checked, setChecked] = useState<string[]>([])
  const [newId, setNewId] = useState(''); const [notice, setNotice] = useState('')
  const selectedId = params.get('feeder') ?? 'F-13'; const selected = collection.feeders.find(item => item.id === selectedId)
  function choose(id: string) { setParams(current => { const next = new URLSearchParams(current); next.set('feeder', id); return next }) }
  function persist(next: typeof collection, message: string) { try { setCollection(saveCurrentCollection(window.localStorage, collection, next, readFeederCollection, saveFeederCollection)); setNotice(message); return true } catch (error) { setNotice(error instanceof Error ? error.message : 'Save failed. Your input is preserved.'); return false } }
  function run(action: () => typeof collection, success: string) {
    try { return persist(action(), success) } catch (error) { setNotice(error instanceof Error ? error.message : 'Feeder operation failed.'); return false }
  }
  return <main className="suite-page"><header className="suite-title"><div><small>GRID / CONTROL RESPONSIBILITY</small>
    <h1>Feeder dispatch workspace</h1><p>Independent switch plans connected to outage groups and named control review.</p></div></header>
    <section className="metrics" aria-label="Feeder summary">
      <article><small>Active feeders</small><strong>{collection.feeders.filter(item => !item.archived).length}</strong></article>
      <article><small>Control requests</small><strong>{feederInbox(collection).length}</strong></article>
      <article><small>Outage groups</small><strong>{collection.groups.length}</strong></article>
    </section>
    <section className="suite-card" aria-label="Control queue"><h2>Control work queue</h2>
      {feederInbox(collection).length ? <ul>{feederInbox(collection).map(item => <li key={item.feederId + item.requestId}>
        <button onClick={() => { choose(item.feederId) }}>{item.feederId}</button> · {item.mw} MW ·
        {item.critical ? 'critical' : 'routine'} · {item.assigneeId ?? 'team queue'} · {item.status}</li>)}</ul> : <p>No control requests.</p>}
      <label>Control engineer <select value={controller} onChange={event => { setController(event.target.value) }}>
        {controlEngineers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </section>
    <section className="suite-card" aria-label="Feeder collection"><h2>Feeders</h2>
      <label>Search feeders <input value={query} onChange={event => { setQuery(event.target.value) }} /></label>
      <label>Show <select value={filter} onChange={event => { setFilter(event.target.value) }}><option value="active">Active</option>
        <option value="archived">Archived</option><option value="all">All</option></select></label>
      {feederRows(collection, query, filter).length ? <ul>{feederRows(collection, query, filter).map(record => <li key={record.id}>
        <label><input type="checkbox" checked={checked.includes(record.id)} onChange={event => {
          setChecked(current => event.target.checked ? [...current, record.id] : current.filter(id => id !== record.id))
        }} /> Select {record.id}</label>
        <button aria-current={selectedId === record.id ? 'true' : undefined} onClick={() => { choose(record.id) }}>
          {record.id} · {record.outageGroupId}</button> · plan r{record.plan.revision} · {record.plan.dispatchMw ?? 'uncommitted'} MW
        {record.archived ? ' · archived' : ''}</li>)}</ul> : <p>No feeders match this view.</p>}
      <button disabled={!checked.length} onClick={() => { const result = requestFeederDispatches(collection, checked, 10)
        persist(result.collection, `${String(result.updated.length)} requested; ${String(result.skipped.length)} skipped; ${String(result.blocked.length)} blocked.`)
      }}>Request selected 10 MW dispatches</button>
      <form onSubmit={event => { event.preventDefault(); if (run(() => createFeeder(collection, newId, 'OUT-NORTH'), 'Feeder created.')) setNewId('') }}>
        <label>New feeder ID <input value={newId} onChange={event => { setNewId(event.target.value) }} required pattern="F-[0-9]{2}" /></label>
        <button type="submit">Add north feeder</button></form>
    </section>
    <section className="suite-card" aria-label="Selected feeder"><h2>{selected?.id ?? 'Select a feeder'}</h2>{selected && <>
      <p>{selected.outageGroupId} · switching r{selected.plan.revision} · {selected.plan.edges.filter(item => item.closed).length} closed switches</p>
      <p>Dispatch {selected.plan.dispatchMw ?? 'not committed'} MW · controller {selected.plan.dispatchRequests?.find(item => item.status === 'open')?.assigneeId ?? 'unassigned'}</p>
      <button onClick={() => { run(() => assignFeederControl(collection, selected.id, controller, selected.plan.revision), 'Control request assigned.') }}>Assign selected control request</button>
      <button onClick={() => { const group = collection.groups.find(item => item.id === selected.outageGroupId)
        if (!group) return
        try { const result = reviseOutageGroup(collection, group.id, group.revision)
          persist(result.collection, `${String(result.updated.length)} related feeders updated; ${String(result.blocked.length)} blocked.`)
        } catch (error) { setNotice(error instanceof Error ? error.message : 'Outage revision failed.') }
      }}>Revise linked outage group</button>
      <button onClick={() => { run(() => archiveFeeder(collection, selected.id), 'Feeder archived.') }}>Archive feeder</button>
      <details><summary>Switching history</summary><ol>{selected.plan.history.map(item =>
        <li key={item.revision}>{item.action} · r{item.revision} · {item.affected}</li>)}</ol></details>
    </>}</section>
    <section className="suite-card" aria-label="Feeder audit"><h2>Collection audit</h2><ol>{collection.audit.toReversed().slice(0, 8).map((item, index) =>
      <li key={index}>{item.action} · {item.id} · {item.related.join(', ') || 'none'}</li>)}</ol></section>
    <nav aria-label="Selected record workflows">{selected && !selected.archived && <><Link to={recordDetailPath(selected)}>Open record details</Link>{' · '}<Link to={recordDecisionPath(selected)}>Open decision workflow</Link></>} <button onClick={() => { try { setCollection(readFeederCollection(window.localStorage)); setNotice('Workspace refreshed; selection preserved.') } catch (error) { setNotice(error instanceof Error ? error.message : 'Refresh failed.') } }}>Refresh workspace</button></nav>
    <p role="status">{notice}</p>
  </main>
}
