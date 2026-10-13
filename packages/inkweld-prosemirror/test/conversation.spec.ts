/**
 * Tests for the conversation nodes (`speech`, `parenthetical`, `dialogue`):
 * schema composition, DOM round-trip, XML round-trip and Markdown output.
 */
import { describe, expect, it } from 'vitest';
import { type DOMOutputSpec, type MarkSpec, type NodeSpec, Schema } from 'prosemirror-model';
import * as Y from 'yjs';

import { xmlToMarkdown } from '../src/markdown';
import {
  CONVERSATION_NODE_NAMES,
  DIALOGUE_NODE_NAME,
  PARENTHETICAL_NODE_NAME,
  SPEECH_NODE_NAME,
  type SpeechNodeAttrs,
  createExtendedSchemaSpec,
  speechNodeSpec,
} from '../src/schema';
import { applyXmlToYjsFragment, BLOCK_NODE_NAMES, serializeYjsFragmentToXml } from '../src/xml';

const baseNodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },
  paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
  text: { group: 'inline' },
};
const baseMarks: Record<string, MarkSpec> = {
  link: { attrs: { href: {} }, toDOM: () => ['a', 0] },
};

function buildSchema(): Schema {
  return new Schema(createExtendedSchemaSpec({ baseNodes, baseMarks }));
}

describe('conversation schema', () => {
  it('is composed into the extended schema', () => {
    const schema = buildSchema();
    for (const name of CONVERSATION_NODE_NAMES) {
      expect(schema.nodes[name]).toBeDefined();
    }
  });

  it('requires a dialogue and allows an optional parenthetical', () => {
    const schema = buildSchema();
    const speech = schema.nodes[SPEECH_NODE_NAME];
    const parenthetical = schema.nodes[PARENTHETICAL_NODE_NAME].create(null, schema.text('quietly'));
    const dialogue = schema.nodes[DIALOGUE_NODE_NAME].create(null, schema.text('Hello.'));

    expect(speech.validContent(schema.nodes['doc'].create().content)).toBe(false);
    expect(() => speech.createChecked({ speakerName: 'Mara' }, [dialogue])).not.toThrow();
    expect(() => speech.createChecked({ speakerName: 'Mara' }, [parenthetical, dialogue])).not.toThrow();
    expect(() => speech.createChecked({ speakerName: 'Mara' }, [dialogue, parenthetical])).toThrow();
  });

  it('fills a new speech with an empty dialogue', () => {
    const schema = buildSchema();
    const speech = schema.nodes[SPEECH_NODE_NAME].createAndFill({ speakerName: 'Tomas' });
    expect(speech?.childCount).toBe(1);
    expect(speech?.firstChild?.type.name).toBe(DIALOGUE_NODE_NAME);
  });

  it('keeps speech, parenthetical and dialogue out of other block groups', () => {
    const schema = buildSchema();
    expect(schema.nodes[SPEECH_NODE_NAME].isInGroup('block')).toBe(true);
    expect(schema.nodes[DIALOGUE_NODE_NAME].isInGroup('block')).toBe(false);
    expect(schema.nodes[PARENTHETICAL_NODE_NAME].isInGroup('block')).toBe(false);
  });

  it('serialises speaker attributes to DOM and parses them back', () => {
    const schema = buildSchema();
    const node = schema.nodes[SPEECH_NODE_NAME].createAndFill({
      speakerId: 'el-1',
      speakerName: 'Mara',
      extension: 'os',
    } satisfies SpeechNodeAttrs)!;
    const [tag, attrs] = speechNodeSpec.toDOM!(node) as [string, Record<string, string>, number];
    expect(tag).toBe('div');
    expect(attrs['data-speaker-id']).toBe('el-1');
    expect(attrs['data-speaker-name']).toBe('Mara');
    expect(attrs['data-extension']).toBe('os');

    const getAttrs = speechNodeSpec.parseDOM![0].getAttrs as (dom: HTMLElement) => SpeechNodeAttrs;
    const parsed = getAttrs({
      dataset: { speakerId: 'el-1', speakerName: 'Mara', extension: 'os' },
    } as unknown as HTMLElement);
    expect(parsed).toEqual({ speakerId: 'el-1', speakerName: 'Mara', extension: 'os' });
  });

  it('omits unset speaker attributes from the DOM and ignores unknown extensions', () => {
    const schema = buildSchema();
    const node = schema.nodes[SPEECH_NODE_NAME].createAndFill({ speakerName: 'Guard' })!;
    const attrs = (speechNodeSpec.toDOM!(node) as [string, Record<string, string>])[1];
    expect(attrs['data-speaker-id']).toBeUndefined();
    expect(attrs['data-extension']).toBeUndefined();

    const getAttrs = speechNodeSpec.parseDOM![0].getAttrs as (dom: HTMLElement) => SpeechNodeAttrs;
    expect(getAttrs({ dataset: { extension: 'xx' } } as unknown as HTMLElement)).toEqual({
      speakerId: null,
      speakerName: '',
      extension: null,
    });
  });

  it('renders parenthetical and dialogue as marked paragraphs', () => {
    const schema = buildSchema();
    const p = schema.nodes[PARENTHETICAL_NODE_NAME].spec.toDOM!(
      schema.nodes[PARENTHETICAL_NODE_NAME].create(),
    ) as DOMOutputSpec as [string, Record<string, string>];
    const d = schema.nodes[DIALOGUE_NODE_NAME].spec.toDOM!(
      schema.nodes[DIALOGUE_NODE_NAME].create(),
    ) as DOMOutputSpec as [string, Record<string, string>];
    expect(p[1]['data-parenthetical']).toBe('');
    expect(d[1]['data-dialogue']).toBe('');
  });
});

describe('conversation XML', () => {
  it('treats conversation nodes as block nodes', () => {
    for (const name of CONVERSATION_NODE_NAMES) {
      expect(BLOCK_NODE_NAMES.has(name)).toBe(true);
    }
  });

  it('round-trips a speech, including an empty dialogue', () => {
    const xml =
      '<speech speakerId="el-1" speakerName="Mara"><parenthetical>not turning</parenthetical>' +
      '<dialogue>Then fix it.</dialogue></speech><speech speakerName="Tomas"><dialogue></dialogue></speech>';
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('test');
    applyXmlToYjsFragment(Y, doc, fragment, xml);
    expect(serializeYjsFragmentToXml(Y, fragment)).toBe(xml);
  });
});

describe('conversation Markdown', () => {
  it('renders a speech as a bold name, italic direction and the line', () => {
    const md = xmlToMarkdown(
      '<speech speakerName="Mara"><parenthetical>not turning</parenthetical>' +
        '<dialogue>Then fix it.</dialogue></speech>',
    );
    expect(md.trim()).toBe('**Mara:** *(not turning)* Then fix it.');
  });

  it('labels off-screen and voice-over lines and falls back to "Unknown"', () => {
    expect(
      xmlToMarkdown('<speech speakerName="Tomas" extension="os"><dialogue>Hey.</dialogue></speech>').trim(),
    ).toBe('**Tomas (O.S.):** Hey.');
    expect(
      xmlToMarkdown('<speech speakerName="Ana" extension="vo"><dialogue>Later.</dialogue></speech>').trim(),
    ).toBe('**Ana (V.O.):** Later.');
    expect(xmlToMarkdown('<speech><dialogue>Who?</dialogue></speech>').trim()).toBe('**Unknown:** Who?');
  });

  it('skips an empty parenthetical', () => {
    const md = xmlToMarkdown(
      '<speech speakerName="Mara"><parenthetical></parenthetical><dialogue>Fine.</dialogue></speech>',
    );
    expect(md.trim()).toBe('**Mara:** Fine.');
  });
});
