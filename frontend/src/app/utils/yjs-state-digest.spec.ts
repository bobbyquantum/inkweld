import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { yjsStateDigest } from './yjs-state-digest';

function docWithText(text: string): { doc: Y.Doc; ytext: Y.Text } {
  const doc = new Y.Doc();
  const ytext = doc.getText('t');
  ytext.insert(0, text);
  return { doc, ytext };
}

describe('yjsStateDigest', () => {
  it('is stable while the document is unchanged', () => {
    const { doc } = docWithText('hello world');
    expect(yjsStateDigest(doc)).toBe(yjsStateDigest(doc));
  });

  it('changes on an insert', () => {
    const { doc, ytext } = docWithText('hello');
    const before = yjsStateDigest(doc);
    ytext.insert(5, '!');
    expect(yjsStateDigest(doc)).not.toBe(before);
  });

  it('changes on a delete-only edit, which leaves the state vector alone', () => {
    const { doc, ytext } = docWithText('hello world');
    const vectorBefore = Y.encodeStateVector(doc);
    const before = yjsStateDigest(doc);

    ytext.delete(0, 6);

    expect(Y.encodeStateVector(doc)).toEqual(vectorBefore);
    expect(yjsStateDigest(doc)).not.toBe(before);
  });

  it('matches for a document reloaded from the same updates', () => {
    const { doc, ytext } = docWithText('hello world');
    ytext.delete(0, 3);
    const reloaded = new Y.Doc();
    Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(doc));
    expect(yjsStateDigest(reloaded)).toBe(yjsStateDigest(doc));
  });
});
