import type { R2Bucket } from '@cloudflare/workers-types';

interface StoredObject {
  body: Uint8Array;
  etag: string;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

/**
 * In-memory R2 bucket with the head/get/put/list/delete subset that project
 * storage uses. `list` pages like R2 and, like R2, leaves out metadata; `failPutAfter`
 * makes every put past that count throw (a Worker running out of
 * subrequests), and `failDelete` makes deletes throw.
 */
export function createObjectBucket(pageSize = 1000) {
  const store = new Map<string, StoredObject>();
  let puts = 0;
  const options = { failPutAfter: Infinity, failDelete: false };
  const etagOf = (body: Uint8Array) => `etag-${Buffer.from(body).toString('hex')}`;

  // Like R2's list(), the summary leaves out the HTTP and custom metadata.
  const summary = (key: string, object: StoredObject) => ({
    key,
    size: object.body.byteLength,
    etag: object.etag,
    uploaded: new Date(0),
  });

  const bucket = {
    list(opts: { prefix?: string; cursor?: string }) {
      const matching = [...store.keys()]
        .filter((key) => key.startsWith(opts.prefix ?? ''))
        .sort((a, b) => a.localeCompare(b));
      const start = opts.cursor ? Number(opts.cursor) : 0;
      const page = matching.slice(start, start + pageSize);
      const end = start + page.length;
      const truncated = end < matching.length;
      return Promise.resolve({
        objects: page.map((key) => summary(key, store.get(key) as StoredObject)),
        truncated,
        cursor: truncated ? String(end) : undefined,
      });
    },
    head(key: string) {
      const object = store.get(key);
      return Promise.resolve(
        object ? { ...summary(key, object), httpMetadata: object.httpMetadata } : null
      );
    },
    get(key: string) {
      const object = store.get(key);
      if (!object) return Promise.resolve(null);
      return Promise.resolve({
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata,
        arrayBuffer: () => Promise.resolve(object.body.slice().buffer),
      });
    },
    put(
      key: string,
      data: ArrayBuffer | Uint8Array,
      opts?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }
    ) {
      if (puts >= options.failPutAfter) return Promise.reject(new Error('Too many subrequests'));
      puts++;
      const body = new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data));
      store.set(key, {
        body,
        etag: etagOf(body),
        httpMetadata: opts?.httpMetadata,
        customMetadata: opts?.customMetadata,
      });
      return Promise.resolve();
    },
    delete(keys: string | string[]) {
      if (options.failDelete) return Promise.reject(new Error('delete failed'));
      for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
      return Promise.resolve();
    },
  };

  const seed = (key: string, text: string, contentType?: string) => {
    const body = new TextEncoder().encode(text);
    store.set(key, {
      body,
      etag: etagOf(body),
      httpMetadata: contentType ? { contentType } : undefined,
      customMetadata: { origin: 'upload' },
    });
  };
  const text = (key: string) => {
    const object = store.get(key);
    return object ? new TextDecoder().decode(object.body) : null;
  };

  return {
    bucket: bucket as unknown as R2Bucket,
    store,
    options,
    seed,
    text,
    putCount: () => puts,
  };
}
