import { describe, expect, it } from 'vitest';

import { flattenConversation } from './conversation-publish';

const speech = (
  attrs: Record<string, unknown>,
  ...children: unknown[]
): Record<string, unknown> => ({ type: 'speech', attrs, content: children });

const part = (type: string, ...content: unknown[]) => ({ type, content });
const text = (value: string, marks?: { type: string }[]) =>
  marks ? { type: 'text', text: value, marks } : { type: 'text', text: value };

describe('flattenConversation', () => {
  it('turns a line into a paragraph with a bold name', () => {
    const out = flattenConversation([
      speech(
        { speakerName: 'Mara', speakerId: null },
        part('dialogue', text('Then fix it.'))
      ),
    ]);
    expect(out).toEqual([
      {
        type: 'paragraph',
        content: [text('Mara:', [{ type: 'strong' }]), text(' Then fix it.')],
      },
    ]);
  });

  it('italicises the note in brackets and keeps existing marks', () => {
    const out = flattenConversation(
      speech(
        { speakerName: 'Mara' },
        part('parenthetical', text('not '), text('turning', [{ type: 'em' }])),
        part('dialogue', text('Fine.', [{ type: 'strong' }]))
      )
    ) as { content: unknown[] };
    // One italic run for the whole note, so exporters emit one emphasis.
    expect(out.content).toEqual([
      text('Mara:', [{ type: 'strong' }]),
      text(' '),
      text('(not turning)', [{ type: 'em' }]),
      text(' '),
      text('Fine.', [{ type: 'strong' }]),
    ]);
  });

  it('keeps runs apart when their marks differ', () => {
    const out = flattenConversation(
      speech(
        { speakerName: 'Ana' },
        part('parenthetical', text('very', [{ type: 'strong' }])),
        part('dialogue', text('No.'))
      )
    ) as { content: unknown[] };
    expect(out.content).toEqual([
      text('Ana:', [{ type: 'strong' }]),
      text(' '),
      text('(', [{ type: 'em' }]),
      text('very', [{ type: 'strong' }, { type: 'em' }]),
      text(')', [{ type: 'em' }]),
      text(' No.'),
    ]);
  });

  it('uses the current element name and marks off-screen / voice-over', () => {
    const resolve = (id: string) => (id === 'el-1' ? 'Mara Vance' : undefined);
    const linked = flattenConversation(
      speech(
        { speakerName: 'Mara', speakerId: 'el-1', extension: 'os' },
        part('dialogue', text('Hey.'))
      ),
      resolve
    ) as { content: { text: string }[] };
    expect(linked.content[0].text).toBe('Mara Vance (O.S.):');

    const voice = flattenConversation(
      speech(
        { speakerName: 'Ana', speakerId: 'gone', extension: 'vo' },
        part('dialogue', text('Later.'))
      ),
      resolve
    ) as { content: { text: string }[] };
    expect(voice.content[0].text).toBe('Ana (V.O.):');
  });

  it('names an unnamed speaker "Unknown" and skips empty parts', () => {
    const out = flattenConversation(
      speech({}, part('parenthetical'), part('dialogue'))
    ) as { content: { text: string }[] };
    expect(out.content).toEqual([text('Unknown:', [{ type: 'strong' }])]);
  });

  it('walks nested content and leaves other nodes untouched', () => {
    const paragraph = { type: 'paragraph', content: [text('Rain.')] };
    const input = {
      type: 'doc',
      content: [
        paragraph,
        speech({ speakerName: 'Tomas' }, part('dialogue', text('Yo.'))),
      ],
    };
    const out = flattenConversation(input) as { content: unknown[] };
    expect(out.content[0]).toEqual(paragraph);
    expect((out.content[1] as { type: string }).type).toBe('paragraph');
    expect(input.content[1]).toMatchObject({ type: 'speech' });
  });

  it('passes through anything that is not a node', () => {
    expect(flattenConversation(null)).toBeNull();
    expect(flattenConversation('text')).toBe('text');
    const leaf = { type: 'horizontal_rule' };
    expect(flattenConversation(leaf)).toBe(leaf);
  });
});
