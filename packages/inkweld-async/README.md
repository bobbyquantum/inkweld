# @inkweld/async

Promise helpers shared by the Inkweld frontend and backend (imported through
the `@inkweld/async` tsconfig path alias):

- `forEachSequential`, `mapSequential`, `firstResultSequential` — run work one
  item at a time as an explicit promise chain, for ordered writes, same-database
  transactions, rate-limited calls and early exit.
- `forEachPage` — walk a cursor-paginated source.
- `forEachConcurrent` — run work with at most `limit` calls in flight.
- `chunk` — split an array into fixed-size batches.

Prefer `Promise.all` when the items are independent.

```bash
bun run test           # vitest
bun run test:coverage  # lcov for SonarCloud
```
