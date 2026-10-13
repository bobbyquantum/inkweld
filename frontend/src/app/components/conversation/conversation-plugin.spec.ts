import { type Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { extendedSchema as schema } from '../element-ref/extended-schema';
import {
  dialogueStart,
  type Speaker,
  speakerOf,
} from './conversation-commands';
import { isConversationMode, setConversationMode } from './conversation-mode';
import {
  conversationDecorations,
  type ConversationPluginOptions,
  createConversationPlugin,
  SPEAKER_COLOR_COUNT,
  speakerColor,
} from './conversation-plugin';
import { initialsFor } from './speech-node-view';

// jsdom has no layout: ProseMirror's scroll-into-view needs these.
function stubRangeRects(): void {
  const proto = Range.prototype as unknown as Record<string, unknown>;
  proto['getClientRects'] ??= () => [];
  proto['getBoundingClientRect'] ??= () => new DOMRect();
  const text = Text.prototype as unknown as Record<string, unknown>;
  text['getClientRects'] ??= () => [];
}

const MARA: Speaker = { id: 'el-mara', name: 'Mara' };
const TOMAS: Speaker = { id: null, name: 'Tomas' };

function p(text = ''): PMNode {
  return schema.nodes['paragraph'].create(
    null,
    text ? schema.text(text) : undefined
  );
}

function line(
  speaker: Speaker,
  text = '',
  extension: 'os' | 'vo' | null = null
): PMNode {
  return schema.nodes['speech'].create(
    { speakerId: speaker.id, speakerName: speaker.name, extension },
    schema.nodes['dialogue'].create(null, text ? schema.text(text) : undefined)
  );
}

function doc(...blocks: PMNode[]): PMNode {
  return schema.nodes['doc'].create(null, blocks);
}

function options(
  overrides: Partial<ConversationPluginOptions> = {}
): ConversationPluginOptions {
  return {
    displayName: speaker => speaker.name,
    avatarUrl: () => Promise.resolve(null),
    onSpeakerClick: vi.fn(),
    label: key => `[${key}]`,
    findSpeaker: name => ({ id: null, name }),
    ...overrides,
  };
}

describe('speakerColor', () => {
  it('is stable and within the palette', () => {
    for (const s of [MARA, TOMAS, { id: null, name: 'Ana' }]) {
      const color = speakerColor(s);
      expect(color).toBeGreaterThanOrEqual(0);
      expect(color).toBeLessThan(SPEAKER_COLOR_COUNT);
      expect(speakerColor({ ...s })).toBe(color);
    }
  });
});

describe('initialsFor', () => {
  it('takes first letters of the first and last words', () => {
    expect(initialsFor('Mara')).toBe('MA');
    expect(initialsFor('Elara Moon Nightwhisper')).toBe('EN');
    expect(initialsFor('  ')).toBe('?');
    expect(initialsFor('éa')).toBe('ÉA');
  });
});

describe('conversationDecorations', () => {
  it('marks runs by the same speaker and colours each line', () => {
    const d = doc(line(MARA, 'a'), line(MARA, 'b'), p('x'), line(TOMAS, 'c'));
    const decos = conversationDecorations(d).find();
    const classes = decos
      .filter(deco => (deco as unknown as { type: { attrs: object } }).type)
      .map(
        deco =>
          (deco as unknown as { type: { attrs: { class?: string } } }).type
            .attrs.class ?? ''
      );
    expect(classes[0]).toContain('speech--first');
    expect(classes[0]).not.toContain('speech--last');
    expect(classes[1]).toContain('speech--last');
    expect(classes[1]).not.toContain('speech--first');
    expect(classes[0]).toContain(`speech--c${speakerColor(MARA)}`);
  });

  it('labels empty notes and lines with placeholders', () => {
    const speech = schema.nodes['speech'].create({ speakerName: 'Mara' }, [
      schema.nodes['parenthetical'].create(),
      schema.nodes['dialogue'].create(),
    ]);
    const decos = conversationDecorations(doc(speech), key => `<${key}>`)
      .find()
      .map(
        deco =>
          (deco as unknown as { type: { attrs: Record<string, string> } }).type
            .attrs
      );
    expect(decos).toContainEqual({
      class: 'is-empty',
      'data-placeholder': '<howTheySayIt>',
    });
    expect(decos).toContainEqual({
      class: 'is-empty',
      'data-placeholder': '<writeLine>',
    });
  });
});

describe('conversation plugin in an editor', () => {
  let host: HTMLElement;
  let view: EditorView;
  let opts: ConversationPluginOptions;

  function mount(
    d: PMNode,
    cursor?: number,
    extra?: Partial<ConversationPluginOptions>
  ) {
    opts = options(extra);
    const state = EditorState.create({
      doc: d,
      plugins: [createConversationPlugin(opts)],
      selection:
        cursor === undefined ? undefined : TextSelection.create(d, cursor),
    });
    view = new EditorView(host, { state });
  }

  function key(name: string, init: KeyboardEventInit = {}): boolean {
    const event = new KeyboardEvent('keydown', { key: name, ...init });
    return !!view.someProp('handleKeyDown', f => f(view, event));
  }

  function typeText(text: string): boolean {
    const { from, to } = view.state.selection;
    return !!view.someProp('handleTextInput', f =>
      f(view, from, to, text, () => view.state.tr.insertText(text))
    );
  }

  function names(): string[] {
    const out: string[] = [];
    view.state.doc.forEach(node =>
      out.push(node.type.name === 'speech' ? speakerOf(node).name : 'p')
    );
    return out;
  }

  beforeEach(() => {
    stubRangeRects();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    view?.destroy();
    host.remove();
  });

  it('switches conversation mode on and off', () => {
    mount(doc(p('x')));
    expect(isConversationMode(view.state)).toBe(false);
    setConversationMode(view, true);
    expect(isConversationMode(view.state)).toBe(true);
    expect(view.dom.classList.contains('conversation-mode')).toBe(true);
    setConversationMode(view, true);
    setConversationMode(view, false);
    expect(view.dom.classList.contains('conversation-mode')).toBe(false);
  });

  it('renders a speech with name, initials and delivery labels', () => {
    mount(doc(line(TOMAS, 'Hey', 'os')));
    const speech = view.dom.querySelector('.speech')!;
    expect(speech.querySelector('.speech__avatar')?.textContent).toBe('TO');
    expect(speech.querySelector('.speech__name')?.textContent).toBe(
      'Tomas · [offscreen] (O.S.)'
    );
    expect(speech.classList.contains('speech--offscreen')).toBe(true);
    expect(speech.querySelector('.speech-dialogue')?.textContent).toBe('Hey');
  });

  it('shows a portrait once it loads, and falls back to "unknown"', async () => {
    mount(doc(line(MARA, 'Hi'), line({ id: null, name: '' }, 'x')), undefined, {
      avatarUrl: () => Promise.resolve('blob:mara'),
    });
    await Promise.resolve();
    await Promise.resolve();
    const [first, second] = Array.from(view.dom.querySelectorAll('.speech'));
    expect(first.querySelector('img')?.getAttribute('src')).toBe('blob:mara');
    expect(second.querySelector('.speech__name')?.textContent).toBe(
      '[unknown]'
    );
  });

  it('re-renders the header when the speaker changes', () => {
    mount(doc(line(TOMAS, 'Hey')));
    view.dispatch(
      view.state.tr.setNodeMarkup(0, undefined, {
        speakerId: null,
        speakerName: 'Ana',
        extension: 'vo',
      })
    );
    const name = view.dom.querySelector('.speech__name')?.textContent;
    expect(name).toBe('Ana · [voiceover] (V.O.)');
  });

  it('reports avatar clicks only while editable', () => {
    mount(doc(line(MARA, 'Hi')));
    (view.dom.querySelector('.speech__avatar') as HTMLElement).click();
    expect(opts.onSpeakerClick).toHaveBeenCalledWith(
      expect.objectContaining({ pos: 0, speaker: MARA })
    );
    view.setProps({ editable: () => false });
    (view.dom.querySelector('.speech__avatar') as HTMLElement).click();
    expect(opts.onSpeakerClick).toHaveBeenCalledTimes(1);
  });

  it('runs the line tools', () => {
    mount(doc(line(MARA, 'Hi')));
    (view.dom.querySelector('.speech__tool--how') as HTMLElement).click();
    expect(view.state.doc.child(0).firstChild?.type.name).toBe('parenthetical');
    (view.dom.querySelector('.speech__tool--offscreen') as HTMLElement).click();
    expect(view.state.doc.child(0).attrs['extension']).toBe('os');
  });

  it('handles Enter, Tab and Backspace inside a speech', () => {
    const d = doc(line(MARA, 'Hi'), line(TOMAS, 'Yo'));
    mount(d, dialogueStart(d.child(1), d.child(0).nodeSize) + 2);
    expect(key('Enter')).toBe(true);
    expect(names()).toEqual(['Mara', 'Tomas', 'Mara']);
    expect(key('Tab')).toBe(true);
    expect(names()).toEqual(['Mara', 'Tomas', 'Tomas']);
    expect(key('Tab', { shiftKey: true })).toBe(true);
    expect(names()).toEqual(['Mara', 'Tomas', 'Mara']);
    expect(key('Backspace')).toBe(true);
    expect(names()).toEqual(['Mara', 'Tomas']);
  });

  it('leaves descriptions alone until conversation mode is on', () => {
    const d = doc(line(MARA, 'Hi'), p('Rain.'));
    mount(d, d.content.size - 1);
    expect(key('Enter')).toBe(false);
    expect(key('Tab')).toBe(false);
    expect(key('Tab', { shiftKey: true })).toBe(false);
    expect(key('ArrowUp', { altKey: true })).toBe(false);
    expect(typeText(' ')).toBe(false);

    setConversationMode(view, true);
    expect(key('ArrowUp', { altKey: true })).toBe(true);
    expect(names()).toEqual(['p', 'Mara']);
    expect(key('ArrowDown', { altKey: true })).toBe(true);
    expect(names()).toEqual(['Mara', 'p']);
    expect(key('Enter')).toBe(true);
    expect(names()).toEqual(['Mara', 'p', 'Mara']);
  });

  it('turns "Name: " into a line in conversation mode', () => {
    const d = doc(p('Ana:'));
    mount(d, 5, { findSpeaker: name => ({ id: 'el-ana', name }) });
    setConversationMode(view, true);
    expect(typeText(' ')).toBe(true);
    expect(speakerOf(view.state.doc.child(0))).toEqual({
      id: 'el-ana',
      name: 'Ana',
    });
    expect(typeText('x')).toBe(false);
  });

  it('ignores text input over a selection', () => {
    const d = doc(p('Ana:'));
    mount(d);
    setConversationMode(view, true);
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 5))
    );
    expect(typeText(' ')).toBe(false);
  });
});
