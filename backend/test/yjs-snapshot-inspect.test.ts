import { describe, it, expect } from 'bun:test';
import * as Y from 'yjs';

import {
  decodeSnapshotMetrics,
  hasDocContent,
  isBlankStateVector,
} from '../src/utils/yjs-snapshot-inspect';

function encoded(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

describe('isBlankStateVector', () => {
  it('is true for a never-touched doc', () => {
    const doc = new Y.Doc();
    expect(isBlankStateVector(encoded(doc))).toBe(true);
    doc.destroy();
  });

  it('is false once any element is inserted', () => {
    const doc = new Y.Doc();
    doc.getArray('elements').push([{ id: 'a' }]);
    expect(isBlankStateVector(encoded(doc))).toBe(false);
    doc.destroy();
  });

  it('is false for a doc whose elements were all deleted (advanced state vector)', () => {
    // The crux of the regression guard: a *deliberately* emptied tree still has
    // an advanced state vector (the deletes are real operations), so it must
    // NOT be treated as a failed-load blank — otherwise legitimate emptying
    // could never compact.
    const doc = new Y.Doc();
    doc.transact(() => doc.getArray('elements').push([{ id: 'a' }, { id: 'b' }]));
    doc.transact(() => doc.getArray('elements').delete(0, 2));
    expect(doc.getArray('elements')).toHaveLength(0);
    expect(isBlankStateVector(encoded(doc))).toBe(false);
    doc.destroy();
  });

  it('is false (safe default) on undecodable bytes', () => {
    expect(isBlankStateVector(new Uint8Array([0xff, 0xff, 0xff]))).toBe(false);
  });
});

describe('hasDocContent', () => {
  it('is false for an empty encoded state', () => {
    const doc = new Y.Doc();
    expect(hasDocContent(encoded(doc))).toBe(false);
    doc.destroy();
  });

  it('is true when the elements array holds items', () => {
    const doc = new Y.Doc();
    doc.getArray('elements').push([{ id: 'a' }]);
    expect(hasDocContent(encoded(doc))).toBe(true);
    doc.destroy();
  });

  it('is true when only a non-elements container holds content', () => {
    const doc = new Y.Doc();
    doc.getMap('worldbuilding').set('place', { name: 'Town' });
    expect(hasDocContent(encoded(doc))).toBe(true);
    doc.destroy();
  });

  it('is true when prosemirror text is present', () => {
    const doc = new Y.Doc();
    const frag = doc.getXmlFragment('prosemirror');
    const text = new Y.XmlText('hello world');
    frag.push([text]);
    expect(hasDocContent(encoded(doc))).toBe(true);
    doc.destroy();
  });

  it('is true (safe default) on undecodable bytes so a good snapshot is kept', () => {
    expect(hasDocContent(new Uint8Array([0xff, 0xff, 0xff]))).toBe(true);
  });

  it('is false when no bytes are stored', () => {
    expect(hasDocContent(undefined)).toBe(false);
  });
});

describe('decodeSnapshotMetrics', () => {
  it('reports element count and other top-level container sizes', () => {
    const doc = new Y.Doc();
    doc.getArray('elements').push([{ id: 'a' }, { id: 'b' }]);
    doc.getMap('worldbuilding').set('place', { name: 'Town' });
    const metrics = decodeSnapshotMetrics(encoded(doc));
    expect(metrics.elementCount).toBe(2);
    expect(metrics.topLevel.elements).toBe(2);
    expect(metrics.topLevel.worldbuilding).toBe(1);
    doc.destroy();
  });

  it('returns null elementCount on undecodable bytes', () => {
    const metrics = decodeSnapshotMetrics(new Uint8Array([0xff, 0xff, 0xff]));
    expect(metrics.elementCount).toBeNull();
    expect(metrics.topLevel).toEqual({});
  });
});
