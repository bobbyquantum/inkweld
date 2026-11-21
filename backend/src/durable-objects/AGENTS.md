# Durable Objects (Cloudflare Workers): agent notes

`yjs-project.do.ts` is one Durable Object per `username:slug` holding all of
the project's Yjs documents; `yjs-do-storage.ts` persists update frames and
compacted snapshots. Overview: `docs/site/docs/developer/architecture.md` →
"Server Real-Time Layer".

- **Persist only sync update frames** (`isSyncUpdateFrame`), never the
  sync-step-2 reply each connecting client receives. Storing that reply wrote
  a full copy of the document per connection and moved the revision token, so
  no document could ever be skipped by the bulk sync planner.
- **Re-attach hibernated sockets before the document changes.** After a wake,
  `this.connections` and the documents are empty but the sockets are still
  open. `loadDocument` subscribes every open, authenticated socket of that
  document (`attachDetachedSockets`) whichever event woke the object, an HTTP
  request (MCP writes) included, and a connection recorded without a document
  (a presence frame or close event wakes with `skipDocLoad`) is attached on
  its next document frame. A frame that still finds no document closes the
  socket with 4500 so the client resyncs. Never drop it: when frames were
  dropped, the app edited a copy the server never saw while MCP edited the
  server's, and the two whole-array element rewrites merged into duplicated
  folders on refresh (`test/yjs-do-wake-reattach.test.ts`).
- **Revision tokens** (`GET /api/revisions`, used by the sync manifest) are the
  newest `update:*` row key, or, once compaction has removed them all, the
  unique `doc:<id>:revision` marker `compact()` writes with each snapshot
  (`YjsDocStorage.readRevision`). Both are read with one bounded reverse scan;
  no document is loaded. **Never use the fixed `snapshot` key as the token**:
  every compaction overwrites it, so a token would repeat after
  `snapshot → edit → compaction` and a changed document be skipped. A snapshot
  with no marker (written before markers existed) gets a fresh one backfilled
  on first read; only if that write fails is it reported `unknown`. Tokens are
  not comparable with the Bun server's.
- `POST /api/destroy` accepts the project owner **or an active site admin**
  (`isActiveSiteAdmin` in `utils/project-access.ts`). Without that, an admin
  account deletion would leave the object, and a re-registered username would
  inherit its documents. The object also refuses a disabled owner's token, so
  account deletion must never reserve the account by disabling it.
- `POST /api/document` with `yUpdate` can also carry `mirrorCanvas`, a canvas to
  mirror onto its element once the update is applied. The object has the merged
  document, which a Worker's copy doesn't (`CommitOptions` in
  `services/yjs-document-access.ts`).
- `POST /api/document` with `relationships: { action: 'reconcile', fields }`
  makes relationship fields link exactly `desiredIds`: the object plans with
  `planRelationshipFieldLinks` against its shared document and applies the
  plan in the same synchronous transaction, then answers with what it added
  and removed. MCP `update_worldbuilding` on Workers uses it so that two
  concurrent writes of a `multiple: false` field can't each add a link; a
  plan made on a Worker's copy could (`utils/relationship-field-reconcile.ts`,
  `test/yjs-do-relationship-reconcile.test.ts`). Keep the read and the write
  free of any `await` between them.
- The object's name is `username:slug` and its rows are keyed
  `doc:username:slug:…`, so a rename copies them to the object of the new
  slug. The Worker drives `/api/rename/*` on both objects
  (`utils/project-durable-object.ts`): lock the old object (closes sockets,
  refuses new ones and HTTP reads with 423, skips and waits for compactions),
  empty the new one, page the rows across with their keys rewritten
  (`yjs-do-transfer.ts`), and wipe the old object once the database has the
  new slug. Each step is authorized by `resolveProjectRenameAccess`, which
  finds the project under either slug and refuses when both name a project.
  The lock lapses after 5 minutes, so a rename that dies half-way cannot leave
  a project unusable.
