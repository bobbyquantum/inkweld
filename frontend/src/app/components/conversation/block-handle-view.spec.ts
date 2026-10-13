import { type Node as PMNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { extendedSchema as schema } from '../element-ref/extended-schema';
import { BlockHandleView } from './block-handle-view';
import { setConversationMode } from './conversation-mode';
import { createConversationPlugin } from './conversation-plugin';

// jsdom has no layout: ProseMirror's scroll-into-view needs these.
function stubRangeRects(): void {
  const proto = Range.prototype as unknown as Record<string, unknown>;
  proto['getClientRects'] ??= () => [];
  proto['getBoundingClientRect'] ??= () => new DOMRect();
  const text = Text.prototype as unknown as Record<string, unknown>;
  text['getClientRects'] ??= () => [];
}

function p(text: string): PMNode {
  return schema.nodes['paragraph'].create(null, schema.text(text));
}

/** Top-level paragraph texts, in order. */
function texts(view: EditorView): string[] {
  const out: string[] = [];
  view.state.doc.forEach(node => out.push(node.textContent));
  return out;
}

/** Give each top-level block a fake 20px-high box, stacked from y = 0. */
function stubLayout(view: EditorView): void {
  Array.from(view.dom.children).forEach((el, i) => {
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      top: i * 20,
      bottom: i * 20 + 20,
      height: 20,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: i * 20,
      toJSON: () => ({}),
    });
  });
}

function dragEvent(type: string, clientY = 0): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    clientY,
    clientX: 10,
    dataTransfer: {
      setData: vi.fn(),
      setDragImage: vi.fn(),
      dropEffect: '',
      effectAllowed: '',
    },
  });
  return event as DragEvent;
}

describe('BlockHandleView', () => {
  let host: HTMLElement;
  let view: EditorView;

  beforeEach(() => {
    stubRangeRects();
    host = document.createElement('div');
    document.body.appendChild(host);
    const doc = schema.nodes['doc'].create(null, [p('A'), p('B'), p('C')]);
    view = new EditorView(host, {
      state: EditorState.create({
        doc,
        plugins: [
          createConversationPlugin({
            displayName: s => s.name,
            avatarUrl: () => Promise.resolve(null),
            onSpeakerClick: vi.fn(),
            label: key => key,
            findSpeaker: name => ({ id: null, name }),
          }),
        ],
      }),
    });
    stubLayout(view);
  });

  afterEach(() => {
    view.destroy();
    host.remove();
  });

  const handle = () => host.querySelector('.block-handle') as HTMLElement;
  const button = (label: string) =>
    host.querySelector(`.block-handle [aria-label="${label}"]`) as HTMLElement;
  const hover = (index: number) =>
    view.dom.children[index].dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true })
    );

  it('stays hidden outside conversation mode', () => {
    hover(1);
    expect(handle().hidden).toBe(true);
  });

  it('follows the hovered block and moves it with the arrows', () => {
    setConversationMode(view, true);
    hover(1);
    expect(handle().hidden).toBe(false);
    expect(handle().style.top).toBe('20px');

    button('moveUp').click();
    expect(texts(view)).toEqual(['B', 'A', 'C']);
    button('moveDown').click();
    expect(texts(view)).toEqual(['A', 'B', 'C']);
  });

  it('hides when the pointer leaves the editor', () => {
    setConversationMode(view, true);
    hover(0);
    view.dom.dispatchEvent(new MouseEvent('mouseleave'));
    expect(handle().hidden).toBe(true);
  });

  it('drags a block to the gap under the pointer', () => {
    setConversationMode(view, true);
    hover(2);
    const grip = host.querySelector('.block-handle__grip') as HTMLElement;
    grip.dispatchEvent(dragEvent('dragstart'));

    const over = dragEvent('dragover', 5);
    view.dom.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    const line = host.querySelector('.block-drop-line') as HTMLElement;
    expect(line.hidden).toBe(false);

    view.dom.dispatchEvent(dragEvent('drop', 5));
    expect(texts(view)).toEqual(['C', 'A', 'B']);
    expect(line.hidden).toBe(true);
  });

  it('ignores drags it did not start', () => {
    setConversationMode(view, true);
    const handleView = BlockHandleView.of(view)!;
    expect(handleView.onDragOver(dragEvent('dragover'))).toBe(false);
    expect(handleView.onDrop(dragEvent('drop'))).toBe(false);
  });

  it('cleans up on destroy', () => {
    view.destroy();
    expect(host.querySelector('.block-handle')).toBeNull();
    expect(BlockHandleView.of(view)).toBeUndefined();
    view = new EditorView(host, {
      state: EditorState.create({ schema }),
    });
  });
});
