/**
 * Editing commands for conversation documents.
 *
 * A conversation is a flat list of top-level blocks: `speech` lines,
 * paragraphs (descriptions) and horizontal rules (scene breaks). These
 * commands are plain ProseMirror commands so they can be unit-tested
 * against an `EditorState` without a view.
 */
import {
  DIALOGUE_NODE_NAME,
  PARENTHETICAL_NODE_NAME,
  SPEECH_NODE_NAME,
  type SpeechExtension,
  type SpeechNodeAttrs,
} from '@inkweld/prosemirror/schema';
import {
  Fragment,
  type Node as PMNode,
  type ResolvedPos,
  type Schema,
} from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';

/** Who says a line: a linked worldbuilding element, or just a name. */
export interface Speaker {
  id: string | null;
  name: string;
}

/** Stable identity for a speaker: the element id, else the folded name. */
export function speakerKey(speaker: Speaker): string {
  return speaker.id
    ? `id:${speaker.id}`
    : `name:${speaker.name.trim().toLocaleLowerCase()}`;
}

export function sameSpeaker(a: Speaker, b: Speaker): boolean {
  return speakerKey(a) === speakerKey(b);
}

/** The speaker recorded on a speech node. */
export function speakerOf(node: PMNode): Speaker {
  const attrs = node.attrs as SpeechNodeAttrs;
  return { id: attrs.speakerId ?? null, name: attrs.speakerName ?? '' };
}

export function isSpeech(node: PMNode | null | undefined): node is PMNode {
  return node?.type.name === SPEECH_NODE_NAME;
}

/** A top-level block and where it starts. */
export interface TopBlock {
  node: PMNode;
  pos: number;
  index: number;
}

/** Every top-level block of the document, in order. */
export function topBlocks(doc: PMNode): TopBlock[] {
  const out: TopBlock[] = [];
  doc.forEach((node, pos, index) => out.push({ node, pos, index }));
  return out;
}

/** The top-level block that contains `$pos`, or the one right after it. */
export function topBlockAt($pos: ResolvedPos): TopBlock | null {
  const doc = $pos.doc;
  if ($pos.depth >= 1) {
    const index = $pos.index(0);
    return { node: $pos.node(1), pos: $pos.before(1), index };
  }
  const index = $pos.index(0);
  const node = doc.maybeChild(index);
  if (!node) return null;
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  return { node, pos, index };
}

/** The speech that contains `$pos` and which child the cursor is in. */
export interface SpeechContext extends TopBlock {
  /** Child the cursor is in. */
  part: 'dialogue' | 'parenthetical';
}

export function speechAt($pos: ResolvedPos): SpeechContext | null {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (isSpeech(node)) {
      const child = $pos.node(depth + 1);
      return {
        node,
        pos: $pos.before(depth),
        index: $pos.index(depth - 1),
        part:
          child?.type.name === PARENTHETICAL_NODE_NAME
            ? 'parenthetical'
            : 'dialogue',
      };
    }
  }
  return null;
}

/** Distinct speakers in order of first appearance. */
export function castOf(doc: PMNode): Speaker[] {
  const seen = new Set<string>();
  const cast: Speaker[] = [];
  doc.descendants(node => {
    if (isSpeech(node)) {
      const speaker = speakerOf(node);
      const key = speakerKey(speaker);
      if (!seen.has(key) && speaker.name.trim()) {
        seen.add(key);
        cast.push(speaker);
      }
      return false;
    }
    return true;
  });
  return cast;
}

/** Speeches that start before `pos`, nearest first. */
function speechesBefore(doc: PMNode, pos: number): PMNode[] {
  return topBlocks(doc)
    .filter(b => b.pos < pos && isSpeech(b.node))
    .map(b => b.node)
    .reverse();
}

/**
 * Who answers `speaker`: the most recent earlier speaker who is someone
 * else, so a two-person exchange alternates by itself. Falls back to any
 * other cast member, then to the same speaker.
 */
export function otherSpeaker(
  doc: PMNode,
  beforePos: number,
  speaker: Speaker
): Speaker {
  for (const node of speechesBefore(doc, beforePos)) {
    const candidate = speakerOf(node);
    if (!sameSpeaker(candidate, speaker)) return candidate;
  }
  return castOf(doc).find(s => !sameSpeaker(s, speaker)) ?? speaker;
}

/**
 * The speaker who would naturally say the next line at `pos`: whoever
 * answers the last line before it. With no earlier line, the first cast
 * member; with no cast at all, `null`.
 */
export function nextSpeakerAt(doc: PMNode, pos: number): Speaker | null {
  const blocks = topBlocks(doc).filter(b => b.pos < pos && isSpeech(b.node));
  const last = blocks.at(-1);
  if (!last) return castOf(doc)[0] ?? null;
  return otherSpeaker(doc, last.pos, speakerOf(last.node));
}

/** Attributes for a speech said by `speaker`. */
export function speechAttrs(
  speaker: Speaker,
  extension: SpeechExtension | null = null
): SpeechNodeAttrs {
  return { speakerId: speaker.id, speakerName: speaker.name, extension };
}

/** A speech for `speaker` holding `content` as its line. */
export function createSpeech(
  schema: Schema,
  speaker: Speaker,
  content: Fragment = Fragment.empty
): PMNode {
  const dialogue = schema.nodes[DIALOGUE_NODE_NAME].create(null, content);
  return schema.nodes[SPEECH_NODE_NAME].create(speechAttrs(speaker), dialogue);
}

/** Position of the start of the dialogue text inside a speech at `pos`. */
export function dialogueStart(speech: PMNode, pos: number): number {
  let offset = pos + 1;
  for (let i = 0; i < speech.childCount; i++) {
    const child = speech.child(i);
    if (child.type.name === DIALOGUE_NODE_NAME) return offset + 1;
    offset += child.nodeSize;
  }
  return pos + 2;
}

/** The dialogue child of a speech, if any. */
function dialogueOf(speech: PMNode): PMNode | null {
  let found: PMNode | null = null;
  speech.forEach(child => {
    if (child.type.name === DIALOGUE_NODE_NAME) found = child;
  });
  return found;
}

/** The parenthetical child of a speech, if any. */
export function parentheticalOf(speech: PMNode): PMNode | null {
  const first = speech.firstChild;
  return first?.type.name === PARENTHETICAL_NODE_NAME ? first : null;
}

/** True when a speech has no words in it at all. */
export function isEmptySpeech(speech: PMNode): boolean {
  return speech.textContent.trim() === '';
}

/**
 * The node starting at `pos`, or `null` when `pos` is out of range. Commands
 * take positions from menus and node views, which a collaborator's edit
 * can make stale before the command runs.
 */
function nodeAt(doc: PMNode, pos: number): PMNode | null {
  return pos >= 0 && pos < doc.content.size ? doc.nodeAt(pos) : null;
}

function setCursor(tr: Transaction, pos: number): Transaction {
  return tr.setSelection(TextSelection.create(tr.doc, pos));
}

/**
 * Insert `node` after the top-level block at the selection. An empty
 * paragraph is replaced instead, so the line goes where the cursor is.
 */
function insertAfterCurrent(
  tr: Transaction,
  node: PMNode
): { tr: Transaction; pos: number } {
  const block = topBlockAt(tr.selection.$from);
  if (!block) {
    const pos = tr.doc.content.size;
    return { tr: tr.insert(pos, node), pos };
  }
  if (block.node.type.name === 'paragraph' && block.node.content.size === 0) {
    return {
      tr: tr.replaceWith(block.pos, block.pos + block.node.nodeSize, node),
      pos: block.pos,
    };
  }
  const pos = block.pos + block.node.nodeSize;
  return { tr: tr.insert(pos, node), pos };
}

/**
 * Add a new line for `speaker` after the current block and put the cursor
 * in it. An empty line at the cursor is reused rather than left behind.
 */
export function addLine(speaker: Speaker): Command {
  return (state, dispatch) => {
    const context = speechAt(state.selection.$from);
    if (context && isEmptySpeech(context.node)) {
      return setSpeaker(context.pos, speaker)(state, dispatch);
    }
    if (dispatch) {
      const speech = createSpeech(state.schema, speaker);
      const { tr, pos } = insertAfterCurrent(state.tr, speech);
      dispatch(setCursor(tr, dialogueStart(speech, pos)).scrollIntoView());
    }
    return true;
  };
}

/** Add an empty description after the current block. */
export const addDescription: Command = (state, dispatch) => {
  const block = topBlockAt(state.selection.$from);
  if (block?.node.type.name === 'paragraph' && block.node.content.size === 0) {
    return true;
  }
  if (dispatch) {
    const paragraph = state.schema.nodes['paragraph'].create();
    const { tr, pos } = insertAfterCurrent(state.tr, paragraph);
    dispatch(setCursor(tr, pos + 1).scrollIntoView());
  }
  return true;
};

/**
 * Add a scene break after the current block, followed by an empty
 * description so there is somewhere to keep writing.
 */
export const addSceneBreak: Command = (state, dispatch) => {
  const rule = state.schema.nodes['horizontal_rule'];
  if (!rule) return false;
  if (dispatch) {
    const { tr, pos } = insertAfterCurrent(state.tr, rule.create());
    const after = pos + 1;
    const next = tr.doc.resolve(after).nodeAfter;
    if (!next || next.type.name !== 'paragraph') {
      tr.insert(after, state.schema.nodes['paragraph'].create());
    }
    dispatch(setCursor(tr, after + 1).scrollIntoView());
  }
  return true;
};

/** Change who says the speech at `pos`. */
export function setSpeaker(pos: number, speaker: Speaker): Command {
  return (state, dispatch) => {
    const node = nodeAt(state.doc, pos);
    if (!isSpeech(node)) return false;
    if (dispatch) {
      dispatch(
        state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          speakerId: speaker.id,
          speakerName: speaker.name,
        })
      );
    }
    return true;
  };
}

/** Toggle off-screen / voice-over on the speech at `pos`. */
export function toggleExtension(
  pos: number,
  extension: SpeechExtension
): Command {
  return (state, dispatch) => {
    const node = nodeAt(state.doc, pos);
    if (!isSpeech(node)) return false;
    if (dispatch) {
      const current = (node.attrs as SpeechNodeAttrs).extension;
      dispatch(
        state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          extension: current === extension ? null : extension,
        })
      );
    }
    return true;
  };
}

/**
 * Add a "how they say it" note to the speech at `pos` and put the cursor in
 * it, or remove the note if there is one.
 */
export function toggleParenthetical(pos: number): Command {
  return (state, dispatch) => {
    const node = nodeAt(state.doc, pos);
    if (!isSpeech(node)) return false;
    if (dispatch) {
      const existing = parentheticalOf(node);
      if (existing) {
        const tr = state.tr.delete(pos + 1, pos + 1 + existing.nodeSize);
        const speech = tr.doc.nodeAt(pos)!;
        const dialogue = dialogueOf(speech);
        dispatch(
          setCursor(
            tr,
            dialogueStart(speech, pos) + (dialogue?.content.size ?? 0)
          )
        );
      } else {
        const note = state.schema.nodes[PARENTHETICAL_NODE_NAME].create();
        dispatch(setCursor(state.tr.insert(pos + 1, note), pos + 2));
      }
    }
    return true;
  };
}

/**
 * Turn the speech at `pos` into a description, keeping its words. A
 * "how they say it" note is kept in brackets at the front.
 */
export function speechToDescription(pos: number): Command {
  return (state, dispatch) => {
    const node = nodeAt(state.doc, pos);
    if (!isSpeech(node)) return false;
    if (dispatch) {
      const schema = state.schema;
      const parts: PMNode[] = [];
      const note = parentheticalOf(node);
      if (note && note.content.size > 0) {
        parts.push(schema.text('('));
        note.content.forEach(n => parts.push(n));
        parts.push(schema.text(') '));
      }
      dialogueOf(node)?.content.forEach(n => parts.push(n));
      const paragraph = schema.nodes['paragraph'].create(
        null,
        Fragment.fromArray(parts)
      );
      const tr = state.tr.replaceWith(pos, pos + node.nodeSize, paragraph);
      const offset = note && note.content.size > 0 ? note.content.size + 3 : 0;
      dispatch(setCursor(tr, pos + 1 + offset));
    }
    return true;
  };
}

/** Turn a top-level paragraph at `pos` into a line for `speaker`. */
export function descriptionToSpeech(pos: number, speaker: Speaker): Command {
  return (state, dispatch) => {
    const node = nodeAt(state.doc, pos);
    if (node?.type.name !== 'paragraph') return false;
    if (dispatch) {
      const speech = createSpeech(state.schema, speaker, node.content);
      const offset = state.selection.from - (pos + 1);
      const tr = state.tr.replaceWith(pos, pos + node.nodeSize, speech);
      const start = dialogueStart(speech, pos);
      dispatch(
        setCursor(tr, start + Math.max(0, Math.min(offset, node.content.size)))
      );
    }
    return true;
  };
}

/** Delete the speech at `pos` and put the cursor at the end of the block before. */
export function deleteSpeech(pos: number): Command {
  return (state, dispatch) => {
    const node = nodeAt(state.doc, pos);
    if (!isSpeech(node)) return false;
    if (dispatch) {
      if (state.doc.childCount === 1) {
        const paragraph = state.schema.nodes['paragraph'].create();
        const tr = state.tr.replaceWith(pos, pos + node.nodeSize, paragraph);
        dispatch(setCursor(tr, pos + 1));
        return true;
      }
      const tr = state.tr.delete(pos, pos + node.nodeSize);
      const target = Math.max(0, pos - 1);
      dispatch(
        tr.setSelection(
          TextSelection.near(
            tr.doc.resolve(Math.min(target, tr.doc.content.size)),
            -1
          )
        )
      );
    }
    return true;
  };
}

/** Move the top-level block at `index` to sit before block `toIndex`. */
export function moveBlock(index: number, toIndex: number): Command {
  return (state, dispatch) => {
    const blocks = topBlocks(state.doc);
    const from = blocks[index];
    const target = Math.max(0, Math.min(toIndex, blocks.length));
    if (!from || target === index || target === index + 1) return false;
    if (dispatch) {
      const sel = state.selection;
      const inside =
        sel.from >= from.pos && sel.to <= from.pos + from.node.nodeSize;
      const offset = sel.from - from.pos;
      const insertAt =
        target < blocks.length ? blocks[target].pos : state.doc.content.size;
      const tr = state.tr.insert(insertAt, from.node);
      const newPos = insertAt;
      const mapped = tr.mapping.map(from.pos);
      tr.delete(mapped, mapped + from.node.nodeSize);
      const landed = tr.mapping.slice(1).map(newPos);
      if (inside) {
        tr.setSelection(
          TextSelection.near(tr.doc.resolve(landed + Math.max(1, offset)))
        );
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Move the block holding the cursor one place up (`-1`) or down (`1`). */
export function moveCurrentBlock(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const block = topBlockAt(state.selection.$from);
    if (!block) return false;
    const to = direction < 0 ? block.index - 1 : block.index + 2;
    if (to < 0 || to > state.doc.childCount) return false;
    return moveBlock(block.index, to)(state, dispatch);
  };
}

/** Change the speaker of the line at the cursor to the next/previous cast member. */
export function cycleSpeaker(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const context = speechAt(state.selection.$from);
    if (!context) return false;
    const cast = castOf(state.doc);
    if (cast.length < 2) return true;
    const current = speakerOf(context.node);
    const index = cast.findIndex(s => sameSpeaker(s, current));
    const next =
      cast[(index + direction + cast.length) % cast.length] ?? cast[0];
    return setSpeaker(context.pos, next)(state, dispatch);
  };
}

/**
 * Enter inside a speech.
 *
 * - In "how they say it": jump to the line itself.
 * - On an empty line: turn it into a description.
 * - At the end of a line: start the answering speaker's line below.
 * - Mid-line: split, carrying the rest of the line into a new line by the
 *   same speaker.
 */
export const enterInSpeech: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const context = speechAt($from);
  if (!context) return false;
  if (!empty) {
    // Replace the selection first, then behave as for a collapsed cursor.
    if (dispatch) {
      const tr = state.tr.deleteSelection();
      let follow: Transaction | null = null;
      enterInSpeech(state.apply(tr), next => (follow = next));
      if (follow) {
        const next: Transaction = follow;
        for (const step of next.steps) tr.step(step);
        tr.setSelection(next.selection.getBookmark().resolve(tr.doc));
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  }
  const { node: speech, pos } = context;

  if (context.part === 'parenthetical') {
    if (dispatch) {
      dispatch(setCursor(state.tr, dialogueStart(speech, pos)));
    }
    return true;
  }

  const dialogue = dialogueOf(speech);
  if (!dialogue || dialogue.content.size === 0) {
    return speechToDescription(pos)(state, dispatch);
  }

  if (dispatch) {
    const after = pos + speech.nodeSize;
    const atEnd = $from.parentOffset === $from.parent.content.size;
    const speaker = speakerOf(speech);
    if (atEnd) {
      const next = createSpeech(
        state.schema,
        otherSpeaker(state.doc, pos, speaker)
      );
      const tr = state.tr.insert(after, next);
      dispatch(setCursor(tr, dialogueStart(next, after)).scrollIntoView());
    } else {
      const rest = $from.parent.content.cut($from.parentOffset);
      const next = createSpeech(state.schema, speaker, rest);
      const tr = state.tr.delete($from.pos, $from.end());
      const insertAt = tr.mapping.map(after);
      tr.insert(insertAt, next);
      dispatch(setCursor(tr, dialogueStart(next, insertAt)).scrollIntoView());
    }
  }
  return true;
};

/**
 * Backspace at the start of a speech part.
 *
 * - Empty note: remove it.
 * - Start of the line with a note above: move into the note.
 * - Empty line: delete the speech.
 * - Start of a line with words: turn it into a description.
 */
export const backspaceInSpeech: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const context = speechAt($from);
  if (!context) return false;
  const { node: speech, pos } = context;
  const note = parentheticalOf(speech);

  if (context.part === 'parenthetical') {
    if (note && note.content.size === 0) {
      return toggleParenthetical(pos)(state, dispatch);
    }
    return true;
  }
  if (note) {
    if (dispatch) dispatch(setCursor(state.tr, pos + 1 + note.nodeSize - 1));
    return true;
  }
  if (isEmptySpeech(speech)) return deleteSpeech(pos)(state, dispatch);
  return speechToDescription(pos)(state, dispatch);
};

/**
 * Enter at the end of a description: start a line for whoever speaks
 * next. Only when the conversation already has someone in it, and only at
 * the end of a non-empty paragraph, so splitting text still works.
 */
export const enterAfterDescription: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.depth !== 1) return false;
  const paragraph = $from.parent;
  if (paragraph.type.name !== 'paragraph' || paragraph.content.size === 0) {
    return false;
  }
  if ($from.parentOffset !== paragraph.content.size) return false;
  const speaker = nextSpeakerAt(state.doc, $from.pos);
  if (!speaker) return false;
  if (dispatch) {
    const after = $from.after(1);
    const speech = createSpeech(state.schema, speaker);
    const tr = state.tr.insert(after, speech);
    dispatch(setCursor(tr, dialogueStart(speech, after)).scrollIntoView());
  }
  return true;
};

/** Tab on a description: make it a line for whoever speaks next. */
export const tabOnDescription: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if ($from.depth !== 1 || $from.parent.type.name !== 'paragraph') {
    return false;
  }
  const speaker = nextSpeakerAt(state.doc, $from.before(1));
  if (!speaker) return false;
  return descriptionToSpeech($from.before(1), speaker)(state, dispatch);
};

/**
 * A description that starts `Name: ` followed by the rest of the line. A
 * name is one to four words, each starting with a capital (or a digit,
 * `#`, or a letter from a script without case), so prose such as
 * `It was late: ` is not mistaken for a speaker.
 */
const NAME_WORD = String.raw`[\p{Lu}\p{Lt}\p{Lo}\p{N}#][\p{L}\p{N}.'’#-]*`;
const NAME_LINE = new RegExp(
  String.raw`^(${NAME_WORD}(?: ${NAME_WORD}){0,3}):\s(.*)$`,
  'su'
);

/**
 * If typing `text` at the cursor completes `Name: ` at the start of a
 * top-level description or of a line, the typed name and whatever was
 * typed after it. Only the input that completes the prefix counts, so
 * editing text that already starts `Note: …` leaves it alone.
 */
export function namePrefixFromInput(
  state: EditorState,
  text: string
): { name: string; rest: string } | null {
  const { $from, empty } = state.selection;
  if (!empty) return null;
  const block = $from.parent;
  const inDescription = $from.depth === 1 && block.type.name === 'paragraph';
  const inLine = block.type.name === DIALOGUE_NODE_NAME && !!speechAt($from);
  if (!inDescription && !inLine) return null;
  const before = block.textBetween(0, $from.parentOffset, undefined, '\ufffc');
  if (NAME_LINE.test(before)) return null;
  const match = NAME_LINE.exec(before + text);
  if (!match) return null;
  return { name: match[1].trim(), rest: match[2] };
}

/**
 * Apply a typed `Name: ` prefix. On a description, replace it with a line
 * by `speaker`; on a line, give that line to `speaker`. Either way the line
 * holds `rest` (typed after the prefix) followed by whatever came after
 * the cursor.
 */
export function applyNameLine(speaker: Speaker, rest: string): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const context = speechAt($from);
    if (context) {
      if (dispatch) {
        const start = $from.start();
        const tr = state.tr.setNodeMarkup(context.pos, undefined, {
          ...context.node.attrs,
          speakerId: speaker.id,
          speakerName: speaker.name,
        });
        tr.replaceWith(start, $from.pos, rest ? state.schema.text(rest) : []);
        dispatch(setCursor(tr, start + rest.length));
      }
      return true;
    }
    if ($from.depth !== 1) return false;
    const pos = $from.before(1);
    const paragraph = $from.parent;
    if (dispatch) {
      const after = paragraph.content.cut($from.parentOffset);
      const content = rest
        ? Fragment.from(state.schema.text(rest)).append(after)
        : after;
      const speech = createSpeech(state.schema, speaker, content);
      const tr = state.tr.replaceWith(pos, pos + paragraph.nodeSize, speech);
      dispatch(setCursor(tr, dialogueStart(speech, pos) + rest.length));
    }
    return true;
  };
}

/** Put the cursor at the end of the line of the speech at `pos`. */
export function focusSpeechEnd(pos: number): Command {
  return (state, dispatch) => {
    const node = nodeAt(state.doc, pos);
    if (!isSpeech(node)) return false;
    if (dispatch) {
      const end =
        dialogueStart(node, pos) + (dialogueOf(node)?.content.size ?? 0);
      dispatch(setCursor(state.tr, end).scrollIntoView());
    }
    return true;
  };
}
