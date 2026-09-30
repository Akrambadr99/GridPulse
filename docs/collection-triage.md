# Collection triage

The feeders collection has URL-backed search, active/archive scope, domain work state, deterministic ID or revision ordering, and 5/10/25-row pagination. Existing responsibility queues deliberately span all active feeders; their scope is labelled independently from collection filters.

View parameters are q, show, state, sort, page, and size. Unknown values fall back safely. Search replaces the current history entry while explicit view choices create history entries. Filter changes return to page one, and shrinking result sets clamp the displayed page. Detail links carry the originating view as an encoded query value; Back to workspace restores the view and selected entity.

Selection is not silently discarded by filtering, sorting, or pagination. Visible selection controls show the total and the count outside the current page; bulk actions retain their existing domain checks and operate on exactly the checked identities. Reset view does not clear selection. Clear selection is explicit. Selection is temporary component state and is not restored after a full reload or detail-route unmount.

Each row keeps its stable record ID. If the selected detail falls outside the current view, an explanation remains visible and selection does not jump to a different record.

Domain triage is a read-only projection, not a new authorization layer. Existing conflict handling, archive rules, independent review requirements, capacity checks, and persistence remain unchanged.

Verification: collectionTriage.test.ts covers actual domain transitions and stale/current distinctions; e2e/sixteenth-pass.spec.ts covers URL history, reload, detail return, selection scope, and page/view recovery. Shared explorer tests cover parser, projection, and selection behavior.
