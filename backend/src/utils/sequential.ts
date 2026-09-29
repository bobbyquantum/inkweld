/**
 * Helpers for work that must run one item at a time.
 *
 * These are for cases where each step depends on the previous one finishing:
 * ordered writes, transactions on the same database, rate-limited calls, or
 * early exit on the first success. They express the sequencing as an explicit
 * promise chain instead of an `await` inside a loop. Where the items are
 * independent, prefer `Promise.all` instead.
 *
 * The item list is snapshotted when the helper is called; if the callback
 * rejects, the remaining items are not started and the rejection propagates.
 */

/** Run `fn` for each item in order, waiting for each call before starting the next. */
export function forEachSequential<T>(
  items: Iterable<T>,
  fn: (item: T, index: number) => unknown
): Promise<void> {
  return Array.from(items).reduce<Promise<void>>(
    (chain, item, index) =>
      chain.then(async () => {
        await fn(item, index);
      }),
    Promise.resolve()
  );
}

/** Like `Array.map`, but each async call starts only after the previous one resolved. */
export async function mapSequential<T, R>(
  items: Iterable<T>,
  fn: (item: T, index: number) => Promise<R> | R
): Promise<R[]> {
  const results: R[] = [];
  await forEachSequential(items, async (item, index) => {
    results.push(await fn(item, index));
  });
  return results;
}

/**
 * Call `fn` for each item in order and resolve with the first result that is
 * not `undefined`; later items are never started. Resolves `undefined` when
 * every call returned `undefined`.
 */
export async function firstResultSequential<T, R>(
  items: Iterable<T>,
  fn: (item: T, index: number) => Promise<R | undefined> | R | undefined
): Promise<R | undefined> {
  let found: R | undefined;
  await forEachSequential(items, async (item, index) => {
    if (found === undefined) {
      found = await fn(item, index);
    }
  });
  return found;
}

/**
 * Walk a cursor-paginated source. Each page can only be requested once the
 * previous page has told us where the next one starts, so this is inherently
 * sequential. `fetchPage` receives the cursor (`undefined` for the first page)
 * and returns the page plus the next cursor, or `undefined` for the last page.
 * `onPage` runs after each fetch, before the next page is requested.
 */
export async function forEachPage<P, C>(
  fetchPage: (cursor: C | undefined) => Promise<{ page: P; next: C | undefined }>,
  onPage: (page: P) => Promise<void> | void
): Promise<void> {
  const step = async (cursor: C | undefined): Promise<void> => {
    const { page, next } = await fetchPage(cursor);
    await onPage(page);
    if (next !== undefined) {
      await step(next);
    }
  };
  await step(undefined);
}
