import { describe, expect, it } from 'bun:test';
import * as decoding from 'lib0/decoding';
import {
  Y_MESSAGE_PRESENCE,
  encodeLeaveFrame,
  peekFrameTag,
} from '../src/services/presence.service';

/**
 * `peekFrameTag` returns null for a frame whose leading varuint cannot be
 * read, like an empty frame.
 */
describe('peekFrameTag', () => {
  it('returns null for an empty frame', () => {
    expect(peekFrameTag(new Uint8Array(0))).toBeNull();
  });

  it('returns null when the message type is cut short', () => {
    expect(peekFrameTag(new Uint8Array([0x80]))).toBeNull();
    expect(peekFrameTag(new Uint8Array([0xff, 0xff, 0xff]))).toBeNull();
  });

  it('returns null when the message type is larger than lib0 can read', () => {
    expect(peekFrameTag(new Uint8Array(16).fill(0xff))).toBeNull();
    expect(peekFrameTag(new Uint8Array(1024).fill(0x80))).toBeNull();
  });

  it('reads the tag and leaves the decoder just past it', () => {
    const frame = encodeLeaveFrame('session-1');
    const peeked = peekFrameTag(frame);
    expect(peeked?.tag).toBe(Y_MESSAGE_PRESENCE);
    expect(peeked && decoding.hasContent(peeked.decoder)).toBe(true);
  });

  it('reads a padded varuint the way the sync handlers do', () => {
    // 0x80 0x00 is 0 (sync) written in two bytes.
    expect(peekFrameTag(new Uint8Array([0x80, 0x00, 0x00]))?.tag).toBe(0);
  });
});
