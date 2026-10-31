# Durable Objects (Cloudflare Workers): agent notes

`yjs-project.do.ts` is one Durable Object per `username:slug` holding all of
the project's Yjs documents; `yjs-do-storage.ts` persists update frames and
compacted snapshots. Overview: `docs/site/docs/developer/architecture.md` →
"Server Real-Time Layer".

- **Persist only sync update frames** (`isSyncUpdateFrame`), never the
  sync-step-2 reply each connecting client receives. Storing that reply wrote
  a full copy of the document per connection and moved the revision token, so
  no document could ever be skipped by the bulk sync planner.
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
