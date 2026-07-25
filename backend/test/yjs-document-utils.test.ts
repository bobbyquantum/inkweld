import { describe, it, expect } from 'bun:test';
import {
  parseDocumentOwner,
  parseTrackableElementId,
  isYjsFrameBlockedForViewer,
  frameMessageType,
  isSyncFrame,
  Y_MESSAGE_SYNC,
  Y_MESSAGE_AWARENESS,
} from '../src/utils/yjs-document-utils';

describe('parseDocumentOwner', () => {
  it('parses a standard username:slug:elements id', () => {
    expect(parseDocumentOwner('alice:my-novel:elements')).toEqual({
      projectOwner: 'alice',
      slug: 'my-novel',
    });
  });

  it('parses a prose document id', () => {
    expect(parseDocumentOwner('alice:my-novel:chapter-1/')).toEqual({
      projectOwner: 'alice',
      slug: 'my-novel',
    });
  });

  it('strips the worldbuilding: prefix before parsing', () => {
    expect(parseDocumentOwner('worldbuilding:alice:my-novel:character-1')).toEqual({
      projectOwner: 'alice',
      slug: 'my-novel',
    });
  });

  it('returns null for malformed ids with too few parts', () => {
    expect(parseDocumentOwner('alice')).toBeNull();
    expect(parseDocumentOwner('')).toBeNull();
  });

  it('returns null when owner or slug is empty', () => {
    expect(parseDocumentOwner(':my-novel:doc')).toBeNull();
    expect(parseDocumentOwner('alice::doc')).toBeNull();
  });
});

describe('parseTrackableElementId', () => {
  it('returns the element id for a prose document with trailing slash', () => {
    expect(parseTrackableElementId('alice:my-novel:chapter-1/')).toBe('chapter-1');
  });

  it('returns the element id for a prose document without trailing slash', () => {
    expect(parseTrackableElementId('alice:my-novel:chapter-1')).toBe('chapter-1');
  });

  it('joins multi-part element ids back together', () => {
    expect(parseTrackableElementId('alice:my-novel:folder:nested:doc/')).toBe('folder:nested:doc');
  });

  it('returns null for the project-level elements tree', () => {
    expect(parseTrackableElementId('alice:my-novel:elements')).toBeNull();
    expect(parseTrackableElementId('alice:my-novel:elements/')).toBeNull();
  });

  it('returns null for worldbuilding documents', () => {
    expect(parseTrackableElementId('worldbuilding:alice:my-novel:character-1')).toBeNull();
  });

  it('returns null for malformed ids', () => {
    expect(parseTrackableElementId('alice:my-novel')).toBeNull();
    expect(parseTrackableElementId('')).toBeNull();
  });
});

describe('isYjsFrameBlockedForViewer', () => {
  it('blocks top-level update frames (messageType === 2)', () => {
    // Some clients send a raw update frame with type byte 2 at offset 0.
    const frame = new Uint8Array([2, 0, 0, 0]);
    expect(isYjsFrameBlockedForViewer(frame)).toBe(true);
  });

  it('blocks sync-step-2 frames (subtype 1)', () => {
    const frame = new Uint8Array([Y_MESSAGE_SYNC, 1, 0, 0]);
    expect(isYjsFrameBlockedForViewer(frame)).toBe(true);
  });

  it('blocks sync-update frames (subtype 2)', () => {
    const frame = new Uint8Array([Y_MESSAGE_SYNC, 2, 0, 0]);
    expect(isYjsFrameBlockedForViewer(frame)).toBe(true);
  });

  it('allows sync-step-1 frames (subtype 0) — viewer requesting state', () => {
    const frame = new Uint8Array([Y_MESSAGE_SYNC, 0]);
    expect(isYjsFrameBlockedForViewer(frame)).toBe(false);
  });

  it('always allows awareness frames (presence/cursors)', () => {
    const frame = new Uint8Array([Y_MESSAGE_AWARENESS, 1, 2, 3]);
    expect(isYjsFrameBlockedForViewer(frame)).toBe(false);
  });

  it('handles ArrayBuffer input', () => {
    const buffer = new Uint8Array([Y_MESSAGE_SYNC, 2]).buffer;
    expect(isYjsFrameBlockedForViewer(buffer)).toBe(true);
  });

  it('returns false for empty frames', () => {
    expect(isYjsFrameBlockedForViewer(new Uint8Array([]))).toBe(false);
  });

  it('returns false for sync frame with no subtype byte', () => {
    expect(isYjsFrameBlockedForViewer(new Uint8Array([Y_MESSAGE_SYNC]))).toBe(false);
  });
});

describe('frameMessageType', () => {
  it('reads single-byte sync/awareness tags directly', () => {
    expect(frameMessageType(new Uint8Array([Y_MESSAGE_SYNC, 0, 0]))).toBe(0);
    expect(frameMessageType(new Uint8Array([Y_MESSAGE_AWARENESS, 1, 2]))).toBe(1);
  });

  it('reads the presence multiplex tag (100)', () => {
    expect(frameMessageType(new Uint8Array([100, 0, 1]))).toBe(100);
  });

  it('decodes a multi-byte varuint when the continuation bit is set', () => {
    // 200 = 0b11001000 → varuint encoding: first byte 0x80 | (200 & 0x7f) = 0xC8,
    // second byte (200 >> 7) = 1. So [0xC8, 0x01] decodes to 200.
    expect(frameMessageType(new Uint8Array([0xc8, 0x01, 0x00]))).toBe(200);
  });

  it('returns -1 for an empty frame', () => {
    expect(frameMessageType(new Uint8Array([]))).toBe(-1);
    expect(frameMessageType(new ArrayBuffer(0))).toBe(-1);
  });

  it('accepts ArrayBuffer input', () => {
    expect(frameMessageType(new Uint8Array([Y_MESSAGE_AWARENESS]).buffer)).toBe(1);
  });
});

describe('isSyncFrame', () => {
  it('is true for sync frames', () => {
    expect(isSyncFrame(new Uint8Array([Y_MESSAGE_SYNC, 1, 2]))).toBe(true);
  });

  it('is false for awareness frames (must not be persisted)', () => {
    expect(isSyncFrame(new Uint8Array([Y_MESSAGE_AWARENESS, 1, 2]))).toBe(false);
  });

  it('is false for presence frames (must not be persisted)', () => {
    expect(isSyncFrame(new Uint8Array([100, 0, 1]))).toBe(false);
  });

  it('is false for empty frames', () => {
    expect(isSyncFrame(new Uint8Array([]))).toBe(false);
  });
});
