import { describe, expect, it } from 'bun:test';
import { documentProjectKey, parseDocumentId } from '../src/utils/yjs-document-id';

describe('parseDocumentId', () => {
  it('parses the elements tree, with and without the trailing slash', () => {
    expect(parseDocumentId('alice:my-novel:elements')).toEqual({
      documentId: 'alice:my-novel:elements',
      bareId: 'alice:my-novel:elements',
      projectOwner: 'alice',
      slug: 'my-novel',
      docName: 'elements',
      isElements: true,
    });
    expect(parseDocumentId('alice:my-novel:elements/')).toEqual({
      documentId: 'alice:my-novel:elements/',
      bareId: 'alice:my-novel:elements',
      projectOwner: 'alice',
      slug: 'my-novel',
      docName: 'elements',
      isElements: true,
    });
  });

  it('parses an element document, with and without the trailing slash', () => {
    const bare = parseDocumentId('alice:my-novel:V1StGXR8_Z5jdHi6B-myT');
    expect(bare?.docName).toBe('V1StGXR8_Z5jdHi6B-myT');
    expect(bare?.isElements).toBe(false);
    expect(bare?.bareId).toBe('alice:my-novel:V1StGXR8_Z5jdHi6B-myT');

    const slashed = parseDocumentId('alice:my-novel:V1StGXR8_Z5jdHi6B-myT/');
    expect(slashed?.documentId).toBe('alice:my-novel:V1StGXR8_Z5jdHi6B-myT/');
    expect(slashed?.bareId).toBe('alice:my-novel:V1StGXR8_Z5jdHi6B-myT');
    expect(slashed?.docName).toBe('V1StGXR8_Z5jdHi6B-myT');
  });

  it('keeps everything after the slug in the document name', () => {
    const parsed = parseDocumentId('alice:my-novel:folder:nested:doc/');
    expect(parsed?.projectOwner).toBe('alice');
    expect(parsed?.slug).toBe('my-novel');
    expect(parsed?.docName).toBe('folder:nested:doc');
    expect(parsed?.isElements).toBe(false);
  });

  it('reads a worldbuilding: prefix as the owner, like any other first segment', () => {
    const parsed = parseDocumentId('worldbuilding:alice:my-novel:character-1');
    expect(parsed?.projectOwner).toBe('worldbuilding');
    expect(parsed?.slug).toBe('alice');
    expect(parsed?.docName).toBe('my-novel:character-1');
  });

  it('only treats a document named exactly elements as the elements tree', () => {
    expect(parseDocumentId('alice:my-novel:x:elements')?.isElements).toBe(false);
    expect(parseDocumentId('alice:my-novel:elements-1')?.isElements).toBe(false);
  });

  it('rejects ids without three non-empty parts', () => {
    for (const id of [
      '',
      'alice',
      'alice:my-novel',
      'alice:my-novel/',
      'alice:my-novel:',
      'alice:my-novel:/',
      ':my-novel:elements',
      'alice::elements',
      '::',
      ':::',
    ]) {
      expect({ id, parsed: parseDocumentId(id) }).toEqual({ id, parsed: null });
    }
  });

  it('rejects more than one trailing slash', () => {
    expect(parseDocumentId('alice:my-novel:elements//')).toBeNull();
    expect(parseDocumentId('alice:my-novel:doc-1///')).toBeNull();
  });

  it('rejects values that are not strings', () => {
    expect(parseDocumentId(undefined)).toBeNull();
    expect(parseDocumentId(null)).toBeNull();
  });
});

describe('documentProjectKey', () => {
  it('is owner:slug for every document of a project', () => {
    const elements = parseDocumentId('alice:my-novel:elements/');
    const doc = parseDocumentId('alice:my-novel:doc-1');
    expect(elements && documentProjectKey(elements)).toBe('alice:my-novel');
    expect(doc && documentProjectKey(doc)).toBe('alice:my-novel');
  });
});
