/**
 * Conversation node specifications.
 *
 * A conversation document mixes ordinary paragraphs (descriptions of what
 * happens), horizontal rules (scene breaks) and `speech` blocks. A speech is
 * one line said by one speaker:
 *
 * ```xml
 * <speech speakerId="el-1" speakerName="Mara">
 *   <parenthetical>not turning</parenthetical>
 *   <dialogue>Then fix it. You said you would.</dialogue>
 * </speech>
 * ```
 *
 * The speaker lives in attributes rather than in a typed cue line, so
 * changing who says a line is an attribute change. `speakerId` links to a
 * worldbuilding element when there is one; `speakerName` is always set so
 * an unlinked speaker ("Guard #2") still has a name, and a linked one keeps
 * a readable name if the element is deleted.
 *
 * Only one level of nesting is used on purpose: concurrent Yjs edits to
 * deeper structures can merge into shapes the schema rejects, and
 * y-prosemirror deletes whatever it cannot build.
 */

import { type Node, type NodeSpec } from 'prosemirror-model';

export const SPEECH_NODE_NAME = 'speech';
export const PARENTHETICAL_NODE_NAME = 'parenthetical';
export const DIALOGUE_NODE_NAME = 'dialogue';

/** Every node name introduced by conversations. */
export const CONVERSATION_NODE_NAMES: readonly string[] = [
  SPEECH_NODE_NAME,
  PARENTHETICAL_NODE_NAME,
  DIALOGUE_NODE_NAME,
];

/** How a line is delivered when the speaker is not simply present. */
export type SpeechExtension = 'os' | 'vo';

export interface SpeechNodeAttrs {
  /** Worldbuilding element that speaks the line, or `null` when unlinked. */
  speakerId: string | null;
  /** Display name; the fallback when there is no (or no longer an) element. */
  speakerName: string;
  /** Off-screen / voice-over, or `null` for an ordinary line. */
  extension: SpeechExtension | null;
}

function readExtension(value: string | null | undefined): SpeechExtension | null {
  return value === 'os' || value === 'vo' ? value : null;
}

export const speechNodeSpec: NodeSpec = {
  group: 'block',
  content: `${PARENTHETICAL_NODE_NAME}? ${DIALOGUE_NODE_NAME}`,
  defining: true,

  attrs: {
    speakerId: { default: null },
    speakerName: { default: '' },
    extension: { default: null },
  },

  parseDOM: [
    {
      tag: 'div[data-speech]',
      getAttrs(dom: HTMLElement): SpeechNodeAttrs {
        return {
          speakerId: dom.dataset['speakerId'] || null,
          speakerName: dom.dataset['speakerName'] ?? '',
          extension: readExtension(dom.dataset['extension']),
        };
      },
    },
  ],

  toDOM(node: Node) {
    const attrs = node.attrs as SpeechNodeAttrs;
    const dom: Record<string, string> = {
      class: 'speech',
      'data-speech': '',
      'data-speaker-name': attrs.speakerName,
    };
    if (attrs.speakerId) dom['data-speaker-id'] = attrs.speakerId;
    if (attrs.extension) dom['data-extension'] = attrs.extension;
    return ['div', dom, 0];
  },
};

export const parentheticalNodeSpec: NodeSpec = {
  content: 'inline*',
  defining: true,
  // Beat the plain `p` paragraph rule (priority 50) when pasting.
  parseDOM: [{ tag: 'p[data-parenthetical]', priority: 60 }],
  toDOM() {
    return ['p', { class: 'speech-parenthetical', 'data-parenthetical': '' }, 0];
  },
};

export const dialogueNodeSpec: NodeSpec = {
  content: 'inline*',
  defining: true,
  parseDOM: [{ tag: 'p[data-dialogue]', priority: 60 }],
  toDOM() {
    return ['p', { class: 'speech-dialogue', 'data-dialogue': '' }, 0];
  },
};

/** The conversation node specs, keyed by node name. */
export const conversationNodeSpecs: Record<string, NodeSpec> = {
  [SPEECH_NODE_NAME]: speechNodeSpec,
  [PARENTHETICAL_NODE_NAME]: parentheticalNodeSpec,
  [DIALOGUE_NODE_NAME]: dialogueNodeSpec,
};
