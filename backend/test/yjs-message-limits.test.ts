import { describe, expect, it } from 'bun:test';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { encodePresenceFrame, writeLeave } from '@inkweld/presence';
import { MAX_YJS_JSON_DEPTH, isYjsMessageWithinLimits } from '../src/utils/yjs-message-limits';
import {
  awarenessMessage,
  awarenessUpdateMessage,
  legacyJsonUpdate,
  nestedArrays,
  syncMessage,
  syncStep1Message,
  updateOf,
} from './yjs-message-fixtures';

/**
 * Sync and awareness messages are applied only when they decode completely
 * and none of their JSON values nests deeper than MAX_YJS_JSON_DEPTH.
 */

/** Updates that each put a value of `depth` levels into a different kind of Yjs content. */
function updatesNesting(depth: number): Array<{ kind: string; update: Uint8Array }> {
  return [
    {
      kind: 'array item',
      update: updateOf((doc) => doc.getArray('a').insert(0, [nestedArrays(depth)])),
    },
    {
      kind: 'map value',
      update: updateOf((doc) => doc.getMap('m').set('key', nestedArrays(depth))),
    },
    {
      kind: 'xml attribute',
      update: updateOf((doc) => {
        const element = new Y.XmlElement('paragraph');
        doc.getXmlFragment('prosemirror').insert(0, [element]);
        // An attribute can hold any JSON value; the typings default to strings.
        element.setAttribute('data', nestedArrays(depth) as string);
      }),
    },
    {
      kind: 'text format',
      update: updateOf((doc) => doc.getText('t').insert(0, 'hi', { mark: nestedArrays(depth) })),
    },
    {
      kind: 'text embed',
      update: updateOf((doc) => doc.getText('t').insertEmbed(0, nestedArrays(depth) as object)),
    },
    {
      kind: 'subdocument options',
      // The options object is one level above `meta`.
      update: updateOf((doc) =>
        doc.getMap('docs').set('sub', new Y.Doc({ meta: nestedArrays(depth - 1) }))
      ),
    },
    {
      kind: 'legacy JSON item',
      update: legacyJsonUpdate('a', JSON.stringify(nestedArrays(depth))),
    },
  ];
}

describe('isYjsMessageWithinLimits', () => {
  describe('document updates', () => {
    it('accepts ordinary content of every kind, as an update and as a step 2 reply', () => {
      const update = updateOf((doc) => {
        doc
          .getArray('elements')
          .insert(0, [{ id: 'e1', name: 'Chapter', metadata: { tags: ['a', 'b'], order: 1 } }]);
        doc.getMap('meta').set('cover', { source: { kind: 'media', id: 'm1' } });
        const text = doc.getText('t');
        text.insert(0, 'Hello world', { bold: true, link: { href: 'https://example.com' } });
        text.insertEmbed(5, { image: 'media:m1' });
        text.delete(0, 2);
        const paragraph = new Y.XmlElement('paragraph');
        paragraph.setAttribute('align', 'center');
        paragraph.insert(0, [new Y.XmlText('Prose')]);
        doc.getXmlFragment('prosemirror').insert(0, [paragraph]);
        doc.getMap('files').set('bytes', new Uint8Array([1, 2, 3]));
        doc.getMap('docs').set('sub', new Y.Doc({ meta: { title: 'Sub' } }));
      });
      expect(isYjsMessageWithinLimits(syncMessage(update))).toBe(true);
      expect(isYjsMessageWithinLimits(syncMessage(update, 'step2'))).toBe(true);
      expect(isYjsMessageWithinLimits(syncMessage(updateOf(() => undefined)))).toBe(true);
    });

    it('accepts values nested exactly to the limit', () => {
      for (const { kind, update } of updatesNesting(MAX_YJS_JSON_DEPTH)) {
        expect({ kind, accepted: isYjsMessageWithinLimits(syncMessage(update)) }).toEqual({
          kind,
          accepted: true,
        });
      }
    });

    it('refuses values nested one level deeper than the limit', () => {
      for (const { kind, update } of updatesNesting(MAX_YJS_JSON_DEPTH + 1)) {
        for (const kindOfMessage of ['update', 'step2'] as const) {
          expect({
            kind,
            kindOfMessage,
            accepted: isYjsMessageWithinLimits(syncMessage(update, kindOfMessage)),
          }).toEqual({ kind, kindOfMessage, accepted: false });
        }
      }
    });

    it('counts nested objects as well as arrays', () => {
      let value: Record<string, unknown> = {};
      for (let level = 1; level < MAX_YJS_JSON_DEPTH; level++) value = { child: value };
      const atLimit = updateOf((doc) => doc.getMap('m').set('key', value));
      const overLimit = updateOf((doc) => doc.getMap('m').set('key', { child: value }));
      expect(isYjsMessageWithinLimits(syncMessage(atLimit))).toBe(true);
      expect(isYjsMessageWithinLimits(syncMessage(overLimit))).toBe(false);
    });

    it('does not count brackets inside strings', () => {
      const brackets = '['.repeat(MAX_YJS_JSON_DEPTH * 2);
      const inAny = updateOf((doc) => doc.getArray('a').insert(0, [{ text: brackets }]));
      const inJson = legacyJsonUpdate('a', JSON.stringify({ text: `"${brackets}\\"{{` }));
      expect(isYjsMessageWithinLimits(syncMessage(inAny))).toBe(true);
      expect(isYjsMessageWithinLimits(syncMessage(inJson))).toBe(true);
    });

    it('refuses an update that does not decode', () => {
      const update = updateOf((doc) => doc.getArray('a').insert(0, [{ id: 'e1' }]));
      expect(isYjsMessageWithinLimits(syncMessage(update.subarray(0, update.length - 3)))).toBe(
        false
      );
      expect(isYjsMessageWithinLimits(syncMessage(legacyJsonUpdate('a', '{"open":')))).toBe(false);
      expect(isYjsMessageWithinLimits(syncMessage(new Uint8Array([0xff, 0xff])))).toBe(false);
    });
  });

  describe('awareness updates', () => {
    it('accepts what y-websocket clients send: states, removals and nesting to the limit', () => {
      const doc = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(doc);
      awareness.setLocalState({ user: { name: 'Ada', color: '#123456' }, cursor: null });
      const encoded = awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID]);
      awareness.destroy();
      doc.destroy();
      expect(isYjsMessageWithinLimits(awarenessUpdateMessage(encoded))).toBe(true);

      expect(
        isYjsMessageWithinLimits(
          awarenessMessage([
            { clientId: 1, clock: 3, stateJson: 'null' },
            { clientId: 2, clock: 1, stateJson: '{}' },
            { clientId: 3, clock: 1, stateJson: JSON.stringify(nestedArrays(MAX_YJS_JSON_DEPTH)) },
            { clientId: 4, clock: 1, stateJson: JSON.stringify({ text: '[[[[' }) },
          ])
        )
      ).toBe(true);
      expect(isYjsMessageWithinLimits(awarenessMessage([]))).toBe(true);
    });

    it('refuses a state nested deeper than the limit', () => {
      const deep = JSON.stringify({ cursor: nestedArrays(MAX_YJS_JSON_DEPTH) });
      expect(
        isYjsMessageWithinLimits(awarenessMessage([{ clientId: 1, clock: 1, stateJson: deep }]))
      ).toBe(false);
    });

    it('refuses the whole update when any state cannot be read', () => {
      expect(
        isYjsMessageWithinLimits(
          awarenessMessage([
            { clientId: 1, clock: 1, stateJson: '{}' },
            { clientId: 2, clock: 1, stateJson: '{"user":' },
          ])
        )
      ).toBe(false);
    });

    it('refuses an update that does not decode', () => {
      const message = awarenessMessage([{ clientId: 1, clock: 1, stateJson: '{"a":1}' }]);
      // `slice`, not `subarray`: a view would still reach the cut-off bytes.
      expect(isYjsMessageWithinLimits(message.slice(0, message.length - 2))).toBe(false);
      // An update that announces five entries and holds none.
      expect(isYjsMessageWithinLimits(new Uint8Array([1, 1, 5]))).toBe(false);
    });
  });

  describe('other messages', () => {
    it('lets through sync step 1 and message types it does not check', () => {
      expect(isYjsMessageWithinLimits(syncStep1Message())).toBe(true);
      expect(isYjsMessageWithinLimits(encodePresenceFrame((e) => writeLeave(e, 'session-1')))).toBe(
        true
      );
      expect(isYjsMessageWithinLimits(new Uint8Array([9, 0xff]))).toBe(true);
    });

    it('refuses a message whose type cannot be read', () => {
      expect(isYjsMessageWithinLimits(new Uint8Array(0))).toBe(false);
      expect(isYjsMessageWithinLimits(new Uint8Array([0x80]))).toBe(false);
      // A sync message with no sub-type.
      expect(isYjsMessageWithinLimits(new Uint8Array([0]))).toBe(false);
    });
  });
});
