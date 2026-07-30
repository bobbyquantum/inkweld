import { describe, it, expect, beforeEach } from 'bun:test';
import { YjsService } from '../src/services/yjs.service';

type YjsServiceInternals = {
  persistFailures: Map<string, number>;
};

function internals(service: YjsService): YjsServiceInternals {
  return service as unknown as YjsServiceInternals;
}

describe('YjsService persist failure tracking', () => {
  let service: YjsService;

  beforeEach(() => {
    service = new YjsService();
  });

  it('tracks failures independently per documentId', () => {
    const m = internals(service).persistFailures;
    m.set('alice:proj:elements/', 3);
    m.set('bob:proj:elements/', 1);

    expect(m.get('alice:proj:elements/')).toBe(3);
    expect(m.get('bob:proj:elements/')).toBe(1);
    expect(m.size).toBe(2);
  });

  it('recovery clears only the affected document', () => {
    const m = internals(service).persistFailures;
    m.set('alice:proj:elements/', 5);
    m.set('bob:proj:elements/', 2);

    m.delete('alice:proj:elements/');

    expect(m.has('alice:proj:elements/')).toBe(false);
    expect(m.get('bob:proj:elements/')).toBe(2);
  });

  it('increments count for repeated failures on the same document', () => {
    const m = internals(service).persistFailures;
    const docId = 'alice:proj:elements/';

    for (let i = 1; i <= 10; i++) {
      const count = (m.get(docId) ?? 0) + 1;
      m.set(docId, count);
    }

    expect(m.get(docId)).toBe(10);
  });

  it('cleanup removes failure state for the document', () => {
    const m = internals(service).persistFailures;
    m.set('alice:proj:elements/', 7);
    m.set('alice:proj:doc1/', 3);

    m.delete('alice:proj:elements/');
    m.delete('alice:proj:doc1/');

    expect(m.size).toBe(0);
  });
});
