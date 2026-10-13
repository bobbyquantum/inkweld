/**
 * ProseMirror plugin for conversations.
 *
 * Always installed: speech lines render as bubbles in any document, and
 * the in-speech keys (Enter, Tab, Backspace) only act inside a speech.
 * Behaviour that changes how ordinary paragraphs work — Enter at the end
 * of a description starting a line, `Name:` shortcuts, moving blocks — is
 * switched on per document with {@link setConversationMode}, which the
 * editor does for documents whose format is `conversation`.
 */
import {
  DIALOGUE_NODE_NAME,
  PARENTHETICAL_NODE_NAME,
  SPEECH_NODE_NAME,
} from '@inkweld/prosemirror/schema';
import { keydownHandler } from 'prosemirror-keymap';
import { type Node as PMNode } from 'prosemirror-model';
import { type Command, Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

import { elementRefPluginKey } from '../element-ref/element-ref-plugin';
import { BlockHandleView } from './block-handle-view';
import {
  applyNameLine,
  backspaceInSpeech,
  cycleSpeaker,
  enterAfterDescription,
  enterInSpeech,
  isSpeech,
  moveCurrentBlock,
  namePrefixFromInput,
  type Speaker,
  speakerKey,
  speakerOf,
  speechAt,
  tabOnDescription,
} from './conversation-commands';
import {
  conversationPluginKey,
  type ConversationPluginState,
  isConversationMode,
} from './conversation-mode';
import { SpeechNodeView, type SpeechViewHost } from './speech-node-view';

/** Number of speaker colours defined in the stylesheet. */
export const SPEAKER_COLOR_COUNT = 6;

/** Keeps the rolling hash an exact integer (largest 31-bit prime). */
const HASH_MODULUS = 2_147_483_647;

/** A stable colour slot for a speaker. */
export function speakerColor(speaker: Speaker): number {
  const key = speakerKey(speaker);
  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + char.codePointAt(0)!) % HASH_MODULUS;
  }
  return hash % SPEAKER_COLOR_COUNT;
}

export interface ConversationPluginOptions extends SpeechViewHost {
  /** Speaker for a name typed as `Name:` (an element if one matches). */
  findSpeaker(name: string, doc: PMNode): Speaker;
}

/**
 * Grouping, colour and empty-state classes. Consecutive lines by the same
 * speaker form a run: only the first shows the name and only the last
 * shows the avatar and bubble tail.
 */
export function conversationDecorations(
  doc: PMNode,
  label: (key: string) => string = key => key
): DecorationSet {
  const decorations: Decoration[] = [];
  let previous: PMNode | null = null;
  const blocks: { node: PMNode; pos: number }[] = [];
  doc.forEach((node, pos) => blocks.push({ node, pos }));

  blocks.forEach(({ node, pos }, index) => {
    if (!isSpeech(node)) {
      previous = node;
      return;
    }
    const key = speakerKey(speakerOf(node));
    const next = blocks[index + 1]?.node;
    const first = !(
      isSpeech(previous) && speakerKey(speakerOf(previous)) === key
    );
    const last = !(isSpeech(next) && speakerKey(speakerOf(next)) === key);
    const classes = [`speech--c${speakerColor(speakerOf(node))}`];
    if (first) classes.push('speech--first');
    if (last) classes.push('speech--last');
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, { class: classes.join(' ') })
    );

    let offset = pos + 1;
    node.forEach(child => {
      const name = child.type.name;
      if (
        child.content.size === 0 &&
        (name === PARENTHETICAL_NODE_NAME || name === DIALOGUE_NODE_NAME)
      ) {
        decorations.push(
          Decoration.node(offset, offset + child.nodeSize, {
            class: 'is-empty',
            'data-placeholder': label(
              name === PARENTHETICAL_NODE_NAME ? 'howTheySayIt' : 'writeLine'
            ),
          })
        );
      }
      offset += child.nodeSize;
    });
    previous = node;
  });

  return DecorationSet.create(doc, decorations);
}

/** Only in conversation mode. */
function whenEnabled(command: Command): Command {
  return (state, dispatch, view) =>
    isConversationMode(state) && command(state, dispatch, view);
}

/** Inside a speech, or (in conversation mode) on a description. */
function speechOrDescription(
  inSpeech: Command,
  onDescription: Command
): Command {
  return (state, dispatch, view) => {
    if (speechAt(state.selection.$from)) return inSpeech(state, dispatch, view);
    return whenEnabled(onDescription)(state, dispatch, view);
  };
}

const conversationKeys = keydownHandler({
  Enter: speechOrDescription(enterInSpeech, enterAfterDescription),
  Tab: speechOrDescription(cycleSpeaker(1), tabOnDescription),
  'Shift-Tab': (state, dispatch, view) =>
    !!speechAt(state.selection.$from) &&
    cycleSpeaker(-1)(state, dispatch, view),
  Backspace: backspaceInSpeech,
  'Alt-ArrowUp': whenEnabled(moveCurrentBlock(-1)),
  'Alt-ArrowDown': whenEnabled(moveCurrentBlock(1)),
});

export function createConversationPlugin(
  options: ConversationPluginOptions
): Plugin<ConversationPluginState> {
  return new Plugin<ConversationPluginState>({
    key: conversationPluginKey,

    state: {
      init: (_config, state) => ({
        enabled: false,
        decorations: conversationDecorations(state.doc, options.label),
      }),
      apply: (tr, value) => {
        const meta = tr.getMeta(conversationPluginKey) as
          { enabled: boolean } | undefined;
        const enabled = meta ? meta.enabled : value.enabled;
        const decorations = tr.docChanged
          ? conversationDecorations(tr.doc, options.label)
          : value.decorations;
        return enabled === value.enabled && decorations === value.decorations
          ? value
          : { enabled, decorations };
      },
    },

    view: editorView => new BlockHandleView(editorView, options),

    props: {
      decorations: state => conversationPluginKey.getState(state)?.decorations,

      attributes: (state): Record<string, string> =>
        isConversationMode(state) ? { class: 'conversation-mode' } : {},

      nodeViews: {
        [SPEECH_NODE_NAME]: (node, view, getPos) =>
          new SpeechNodeView(node, view, getPos, options),
      },

      handleKeyDown(view, event) {
        // Let an open @-mention popup have Enter, Tab and the arrows.
        if (elementRefPluginKey.getState(view.state)?.active) return false;
        return conversationKeys(view, event);
      },

      handleTextInput(view, from, to, text) {
        const { state } = view;
        if (
          from !== to ||
          from !== state.selection.from ||
          !isConversationMode(state)
        ) {
          return false;
        }
        const typed = namePrefixFromInput(state, text);
        if (!typed) return false;
        const speaker = options.findSpeaker(typed.name, state.doc);
        return applyNameLine(speaker, typed.rest)(state, view.dispatch);
      },

      handleDOMEvents: {
        dragover: (view, event) =>
          BlockHandleView.of(view)?.onDragOver(event) ?? false,
        drop: (view, event) => BlockHandleView.of(view)?.onDrop(event) ?? false,
      },
    },
  });
}
