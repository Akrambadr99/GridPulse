import { collectionBackPath } from '../../workspace/collectionExplorer'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RecordScope } from '../../workspace/RecordScope'
import { openSelectedRecord } from './selectedRecord'

export function SelectedRecordRoute({ children }: { children: ReactNode }) {
  const [params] = useSearchParams()
  const id = params.get('record') ?? 'F-12'
  return <RecordScope id={id} back={collectionBackPath('/grid/feeder-workspace', 'feeder', id, params)}
    open={target => openSelectedRecord(window.localStorage, target)}>{children}</RecordScope>
}
