import { type Node as PMNode } from 'prosemirror-model';
import {
  type Command,
  EditorState,
  NodeSelection,
  TextSelection,
} from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import { extendedSchema as schema } from '../element-ref/extended-schema';
import {
  addDescription,
  addLine,
  addSceneBreak,
  applyNameLine,
  backspaceInSpeech,
  castOf,
  cycleSpeaker,
  deleteSpeech,
  descriptionToSpeech,
  dialogueStart,
  enterAfterDescription,
  enterInSpeech,
  focusSpeechEnd,
  isEmptySpeech,
  moveBlock,
  moveCurrentBlock,
  namePrefixFromInput,
  nextSpeakerAt,
  otherSpeaker,
  sameSpeaker,
  setSpeaker,
  type Speaker,
  speakerKey,
  speakerOf,
  speechAt,
  speechToDescription,
  tabOnDescription,
  toggleExtension,
  toggleParenthetical,
  topBlockAt,
  topBlocks,
} from './conversation-commands';

// ─── Builders ──────────────────────────────────────────────────────────────

const MARA: Speaker = { id: 'el-mara', name: 'Mara' };
const TOMAS: Speaker = { id: null, name: 'Tomas' };
const ANA: Speaker = { id: null, name: 'Ana' };

function p(text = ''): PMNode {
  return schema.nodes['paragraph'].create(
    null,
    text ? schema.text(text) : undefined
  );
}

function hr(): PMNode {
  return schema.nodes['horizontal_rule'].create();
}

function line(speaker: Speaker, text = '', note?: string): PMNode {
  const children: PMNode[] = [];
  if (note !== undefined) {
    children.push(
      schema.nodes['parenthetical'].create(
        null,
        note ? schema.text(note) : undefined
      )
    );
  }
  children.push(
    schema.nodes['dialogue'].create(null, text ? schema.text(text) : undefined)
  );
  return schema.nodes['speech'].create(
    { speakerId: speaker.id, speakerName: speaker.name },
    children
  );
}

function doc(...blocks: PMNode[]): PMNode {
  return schema.nodes['doc'].create(null, blocks);
}

/** Start of top-level block `index`. */
function blockPos(d: PMNode, index: number): number {
  return topBlocks(d)[index].pos;
}

/** State with the cursor inside block `index`, `offset` chars into its text. */
function stateIn(
  d: PMNode,
  index: number,
  offset: number | 'end' = 'end',
  part: 'dialogue' | 'parenthetical' = 'dialogue'
): EditorState {
  const pos = blockPos(d, index);
  const node = d.child(index);
  let start = pos + 1;
  let size = node.content.size;
  if (node.type.name === 'speech') {
    if (part === 'dialogue') {
      start = dialogueStart(node, pos);
      size = node.lastChild!.content.size;
    } else {
      start = pos + 2;
      size = node.firstChild!.content.size;
    }
  }
  const at = start + (offset === 'end' ? size : offset);
  return EditorState.create({
    doc: d,
    selection: TextSelection.create(d, at),
  });
}

function run(state: EditorState, command: Command): EditorState | null {
  let next: EditorState | null = null;
  const handled = command(state, tr => (next = state.apply(tr)));
  if (!handled) return null;
  return next ?? state;
}

/** Compact description of the document: `>Name: text`, `p: text`, `---`. */
function outline(d: PMNode): string[] {
  return topBlocks(d).map(({ node }) => {
    if (node.type.name === 'speech') {
      const note =
        node.firstChild?.type.name === 'parenthetical'
          ? `(${node.firstChild.textContent}) `
          : '';
      const ext = node.attrs['extension']
        ? ` [${node.attrs['extension']}]`
        : '';
      return `>${speakerOf(node).name}${ext}: ${note}${node.lastChild!.textContent}`;
    }
    if (node.type.name === 'horizontal_rule') return '---';
    return `p: ${node.textContent}`;
  });
}

function cursorBlock(state: EditorState): number {
  return topBlockAt(state.selection.$from)!.index;
}

// ─── Speakers ──────────────────────────────────────────────────────────────

describe('speakers', () => {
  it('keys linked speakers by id and unlinked ones by folded name', () => {
    expect(speakerKey(MARA)).toBe('id:el-mara');
    expect(speakerKey({ id: null, name: ' Tomas ' })).toBe('name:tomas');
    expect(sameSpeaker(TOMAS, { id: null, name: 'TOMAS' })).toBe(true);
    expect(sameSpeaker(MARA, { id: null, name: 'Mara' })).toBe(false);
  });

  it('lists the cast in order of first appearance, once each', () => {
    const d = doc(line(TOMAS, 'a'), p('x'), line(MARA, 'b'), line(TOMAS, 'c'));
    expect(castOf(d)).toEqual([TOMAS, MARA]);
  });

  it('skips speakers without a name', () => {
    expect(castOf(doc(line({ id: null, name: '  ' }, 'a')))).toEqual([]);
  });

  it('answers with the most recent other speaker', () => {
    const d = doc(line(MARA, 'a'), line(ANA, 'b'), line(TOMAS, 'c'));
    expect(otherSpeaker(d, blockPos(d, 2), TOMAS)).toEqual(ANA);
  });

  it('falls back to another cast member, then to the same speaker', () => {
    const d = doc(line(TOMAS, 'a'), line(MARA, 'b'));
    expect(otherSpeaker(d, blockPos(d, 0), TOMAS)).toEqual(MARA);
    const solo = doc(line(TOMAS, 'a'));
    expect(otherSpeaker(solo, 0, TOMAS)).toEqual(TOMAS);
  });

  it('picks who speaks next at a position', () => {
    const d = doc(line(MARA, 'a'), line(TOMAS, 'b'), p('then'));
    expect(nextSpeakerAt(d, d.content.size)).toEqual(MARA);
    expect(nextSpeakerAt(d, 0)).toEqual(MARA);
    expect(nextSpeakerAt(doc(p('x')), 0)).toBeNull();
  });
});

// ─── Locating ──────────────────────────────────────────────────────────────

describe('locating blocks', () => {
  it('finds the speech and part around the cursor', () => {
    const d = doc(p('x'), line(MARA, 'hi', 'softly'));
    expect(speechAt(stateIn(d, 1).selection.$from)).toMatchObject({
      index: 1,
      part: 'dialogue',
    });
    expect(
      speechAt(stateIn(d, 1, 0, 'parenthetical').selection.$from)?.part
    ).toBe('parenthetical');
    expect(speechAt(stateIn(d, 0).selection.$from)).toBeNull();
  });

  it('finds the top-level block for a node selection', () => {
    const d = doc(p('x'), hr(), p('y'));
    const state = EditorState.create({
      doc: d,
      selection: NodeSelection.create(d, blockPos(d, 1)),
    });
    expect(topBlockAt(state.selection.$from)?.index).toBe(1);
  });

  it('reports empty speeches', () => {
    expect(isEmptySpeech(line(MARA, ''))).toBe(true);
    expect(isEmptySpeech(line(MARA, '', 'x'))).toBe(false);
  });
});

// ─── Adding ────────────────────────────────────────────────────────────────

describe('addLine', () => {
  it('replaces an empty description with the new line', () => {
    const next = run(stateIn(doc(p()), 0), addLine(MARA))!;
    expect(outline(next.doc)).toEqual(['>Mara: ']);
    expect(speechAt(next.selection.$from)?.index).toBe(0);
  });

  it('adds after the current block', () => {
    const d = doc(p('Rain.'), p('Later.'));
    const next = run(stateIn(d, 0), addLine(TOMAS))!;
    expect(outline(next.doc)).toEqual(['p: Rain.', '>Tomas: ', 'p: Later.']);
    expect(cursorBlock(next)).toBe(1);
  });

  it('reuses an empty line at the cursor instead of adding another', () => {
    const d = doc(line(TOMAS, 'Hi'), line(TOMAS, ''));
    const next = run(stateIn(d, 1), addLine(MARA))!;
    expect(outline(next.doc)).toEqual(['>Tomas: Hi', '>Mara: ']);
  });
});

describe('addDescription and addSceneBreak', () => {
  it('adds an empty description after the current block', () => {
    const next = run(stateIn(doc(line(MARA, 'Hi')), 0), addDescription)!;
    expect(outline(next.doc)).toEqual(['>Mara: Hi', 'p: ']);
    expect(next.selection.$from.parent.type.name).toBe('paragraph');
  });

  it('does nothing on an empty description', () => {
    expect(run(stateIn(doc(p()), 0), addDescription)).toBeNull();
  });

  it('adds a break and somewhere to keep writing', () => {
    const next = run(stateIn(doc(line(MARA, 'Hi')), 0), addSceneBreak)!;
    expect(outline(next.doc)).toEqual(['>Mara: Hi', '---', 'p: ']);
    expect(cursorBlock(next)).toBe(2);
  });

  it('reuses a following description after the break', () => {
    const d = doc(p(), p('After'));
    const next = run(stateIn(d, 0), addSceneBreak)!;
    expect(outline(next.doc)).toEqual(['---', 'p: After']);
  });
});

// ─── Changing a line ───────────────────────────────────────────────────────

describe('changing a line', () => {
  it('sets the speaker', () => {
    const d = doc(line(TOMAS, 'Hi'));
    const next = run(stateIn(d, 0), setSpeaker(0, MARA))!;
    expect(speakerOf(next.doc.child(0))).toEqual(MARA);
    expect(run(stateIn(doc(p('x')), 0), setSpeaker(0, MARA))).toBeNull();
  });

  it('toggles off-screen and voice-over', () => {
    const d = doc(line(TOMAS, 'Hi'));
    let state = run(stateIn(d, 0), toggleExtension(0, 'os'))!;
    expect(outline(state.doc)).toEqual(['>Tomas [os]: Hi']);
    state = run(state, toggleExtension(0, 'vo'))!;
    expect(outline(state.doc)).toEqual(['>Tomas [vo]: Hi']);
    state = run(state, toggleExtension(0, 'vo'))!;
    expect(outline(state.doc)).toEqual(['>Tomas: Hi']);
    expect(run(stateIn(doc(p('x')), 0), toggleExtension(0, 'os'))).toBeNull();
  });

  it('adds a note and puts the cursor in it, then removes it', () => {
    const d = doc(line(MARA, 'Fine.'));
    const added = run(stateIn(d, 0), toggleParenthetical(0))!;
    expect(outline(added.doc)).toEqual(['>Mara: () Fine.']);
    expect(speechAt(added.selection.$from)?.part).toBe('parenthetical');

    const removed = run(added, toggleParenthetical(0))!;
    expect(outline(removed.doc)).toEqual(['>Mara: Fine.']);
    expect(removed.selection.$from.parentOffset).toBe(5);
    expect(run(stateIn(doc(p('x')), 0), toggleParenthetical(0))).toBeNull();
  });

  it('cycles the speaker through the cast', () => {
    const d = doc(line(TOMAS, 'a'), line(MARA, 'b'), line(ANA, 'c'));
    const forward = run(stateIn(d, 0), cycleSpeaker(1))!;
    expect(speakerOf(forward.doc.child(0))).toEqual(MARA);
    const back = run(stateIn(d, 0), cycleSpeaker(-1))!;
    expect(speakerOf(back.doc.child(0))).toEqual(ANA);
  });

  it('keeps the speaker when the cast has one person, outside a speech fails', () => {
    const d = doc(line(TOMAS, 'a'));
    expect(run(stateIn(d, 0), cycleSpeaker(1))?.doc.eq(d)).toBe(true);
    expect(run(stateIn(doc(p('x')), 0), cycleSpeaker(1))).toBeNull();
  });

  it('puts the cursor at the end of a line', () => {
    const d = doc(p('x'), line(MARA, 'Hello'));
    const next = run(stateIn(d, 0), focusSpeechEnd(blockPos(d, 1)))!;
    expect(speechAt(next.selection.$from)?.index).toBe(1);
    expect(next.selection.$from.parentOffset).toBe(5);
    expect(run(stateIn(d, 0), focusSpeechEnd(0))).toBeNull();
  });
});

// ─── Converting and deleting ───────────────────────────────────────────────

describe('converting', () => {
  it('turns a line into a description, keeping a note in brackets', () => {
    const d = doc(line(MARA, 'Then fix it.', 'not turning'));
    const next = run(stateIn(d, 0), speechToDescription(0))!;
    expect(outline(next.doc)).toEqual(['p: (not turning) Then fix it.']);
    expect(next.selection.$from.parentOffset).toBe('(not turning) '.length);
  });

  it('drops an empty note when turning a line into a description', () => {
    const d = doc(line(MARA, 'Hi', ''));
    expect(outline(run(stateIn(d, 0), speechToDescription(0))!.doc)).toEqual([
      'p: Hi',
    ]);
  });

  it('turns a description into a line, keeping the cursor offset', () => {
    const d = doc(p('Hello there'));
    const next = run(stateIn(d, 0, 5), descriptionToSpeech(0, TOMAS))!;
    expect(outline(next.doc)).toEqual(['>Tomas: Hello there']);
    expect(next.selection.$from.parentOffset).toBe(5);
    expect(run(stateIn(d, 0), descriptionToSpeech(99, TOMAS))).toBeNull();
    expect(run(stateIn(d, 0), setSpeaker(-1, TOMAS))).toBeNull();
  });

  it('deletes a line and moves to the end of the one before', () => {
    const d = doc(p('Before'), line(MARA, 'x'));
    const next = run(stateIn(d, 1), deleteSpeech(blockPos(d, 1)))!;
    expect(outline(next.doc)).toEqual(['p: Before']);
    expect(next.selection.$from.parentOffset).toBe(6);
  });

  it('replaces the only line with an empty description', () => {
    const d = doc(line(MARA, 'x'));
    expect(outline(run(stateIn(d, 0), deleteSpeech(0))!.doc)).toEqual(['p: ']);
    expect(run(stateIn(doc(p('x')), 0), deleteSpeech(0))).toBeNull();
  });
});

// ─── Moving ────────────────────────────────────────────────────────────────

describe('moving blocks', () => {
  const d = doc(p('A'), line(MARA, 'B'), p('C'));

  it('moves a block to another gap', () => {
    expect(outline(run(stateIn(d, 0), moveBlock(2, 0))!.doc)).toEqual([
      'p: C',
      'p: A',
      '>Mara: B',
    ]);
    expect(outline(run(stateIn(d, 0), moveBlock(0, 3))!.doc)).toEqual([
      '>Mara: B',
      'p: C',
      'p: A',
    ]);
  });

  it('refuses moves that change nothing', () => {
    expect(run(stateIn(d, 0), moveBlock(1, 1))).toBeNull();
    expect(run(stateIn(d, 0), moveBlock(1, 2))).toBeNull();
    expect(run(stateIn(d, 0), moveBlock(9, 0))).toBeNull();
  });

  it('moves the block at the cursor and keeps the cursor in it', () => {
    const up = run(stateIn(d, 1, 1), moveCurrentBlock(-1))!;
    expect(outline(up.doc)).toEqual(['>Mara: B', 'p: A', 'p: C']);
    expect(speechAt(up.selection.$from)?.index).toBe(0);

    const down = run(stateIn(d, 1, 1), moveCurrentBlock(1))!;
    expect(outline(down.doc)).toEqual(['p: A', 'p: C', '>Mara: B']);
    expect(speechAt(down.selection.$from)?.index).toBe(2);
  });

  it('stops at the ends', () => {
    expect(run(stateIn(d, 0), moveCurrentBlock(-1))).toBeNull();
    expect(run(stateIn(d, 2), moveCurrentBlock(1))).toBeNull();
  });
});

// ─── Keys ──────────────────────────────────────────────────────────────────

describe('Enter in a line', () => {
  it('starts the answering speaker at the end of a line', () => {
    const d = doc(line(MARA, 'Hi'), line(TOMAS, 'Hello'));
    const next = run(stateIn(d, 1), enterInSpeech)!;
    expect(outline(next.doc)).toEqual([
      '>Mara: Hi',
      '>Tomas: Hello',
      '>Mara: ',
    ]);
    expect(speechAt(next.selection.$from)?.index).toBe(2);
  });

  it('splits mid-line into a new line by the same speaker', () => {
    const d = doc(line(TOMAS, 'One. Two.'));
    const next = run(stateIn(d, 0, 4), enterInSpeech)!;
    expect(outline(next.doc)).toEqual(['>Tomas: One.', '>Tomas:  Two.']);
    expect(next.selection.$from.parentOffset).toBe(0);
  });

  it('turns an empty line into a description', () => {
    const next = run(stateIn(doc(line(TOMAS, '')), 0), enterInSpeech)!;
    expect(outline(next.doc)).toEqual(['p: ']);
  });

  it('jumps from the note to the line', () => {
    const d = doc(line(MARA, 'Hi', 'softly'));
    const next = run(stateIn(d, 0, 'end', 'parenthetical'), enterInSpeech)!;
    expect(next.doc.eq(d)).toBe(true);
    expect(speechAt(next.selection.$from)?.part).toBe('dialogue');
  });

  it('replaces a selection before acting', () => {
    const d = doc(line(MARA, 'Hello'), line(TOMAS, 'x'));
    const start = dialogueStart(d.child(0), 0);
    const state = EditorState.create({
      doc: d,
      selection: TextSelection.create(d, start + 2, start + 5),
    });
    const next = run(state, enterInSpeech)!;
    expect(outline(next.doc)).toEqual(['>Mara: He', '>Tomas: ', '>Tomas: x']);
  });

  it('ignores the cursor outside a speech', () => {
    expect(run(stateIn(doc(p('x')), 0), enterInSpeech)).toBeNull();
  });
});

describe('Backspace at the start of a line', () => {
  it('removes an empty note', () => {
    const d = doc(line(MARA, 'Hi', ''));
    const next = run(stateIn(d, 0, 0, 'parenthetical'), backspaceInSpeech)!;
    expect(outline(next.doc)).toEqual(['>Mara: Hi']);
  });

  it('keeps a note with words in it', () => {
    const d = doc(line(MARA, 'Hi', 'soft'));
    const next = run(stateIn(d, 0, 0, 'parenthetical'), backspaceInSpeech)!;
    expect(next.doc.eq(d)).toBe(true);
  });

  it('moves from the line into its note', () => {
    const d = doc(line(MARA, 'Hi', 'soft'));
    const next = run(stateIn(d, 0, 0), backspaceInSpeech)!;
    expect(speechAt(next.selection.$from)?.part).toBe('parenthetical');
    expect(next.selection.$from.parentOffset).toBe(4);
  });

  it('deletes an empty line', () => {
    const d = doc(p('Before'), line(MARA, ''));
    expect(outline(run(stateIn(d, 1, 0), backspaceInSpeech)!.doc)).toEqual([
      'p: Before',
    ]);
  });

  it('turns a line with words into a description', () => {
    const d = doc(line(MARA, 'Hi'));
    expect(outline(run(stateIn(d, 0, 0), backspaceInSpeech)!.doc)).toEqual([
      'p: Hi',
    ]);
  });

  it('leaves Backspace alone mid-line and outside speeches', () => {
    expect(
      run(stateIn(doc(line(MARA, 'Hi')), 0, 1), backspaceInSpeech)
    ).toBeNull();
    expect(run(stateIn(doc(p('Hi')), 0, 0), backspaceInSpeech)).toBeNull();
  });
});

describe('descriptions', () => {
  it('Enter at the end of a description starts the next line', () => {
    const d = doc(line(MARA, 'Hi'), line(TOMAS, 'Yo'), p('Rain.'));
    const next = run(stateIn(d, 2), enterAfterDescription)!;
    expect(outline(next.doc)).toEqual([
      '>Mara: Hi',
      '>Tomas: Yo',
      'p: Rain.',
      '>Mara: ',
    ]);
  });

  it('Enter leaves empty, mid-text and speaker-less descriptions alone', () => {
    const withCast = doc(line(MARA, 'Hi'), p('Rain.'), p());
    expect(run(stateIn(withCast, 1, 2), enterAfterDescription)).toBeNull();
    expect(run(stateIn(withCast, 2), enterAfterDescription)).toBeNull();
    expect(run(stateIn(doc(p('Rain.')), 0), enterAfterDescription)).toBeNull();
  });

  it('Tab turns a description into the next line', () => {
    const d = doc(line(MARA, 'Hi'), p('Fine.'));
    const next = run(stateIn(d, 1), tabOnDescription)!;
    expect(outline(next.doc)).toEqual(['>Mara: Hi', '>Mara: Fine.']);
    expect(run(stateIn(doc(p('x')), 0), tabOnDescription)).toBeNull();
    expect(run(stateIn(d, 0), tabOnDescription)).toBeNull();
  });
});

describe('typing "Name: "', () => {
  it('recognises the input that completes the prefix', () => {
    expect(namePrefixFromInput(stateIn(doc(p('Mara:')), 0), ' ')).toEqual({
      name: 'Mara',
      rest: '',
    });
    expect(
      namePrefixFromInput(stateIn(doc(p()), 0), 'Old Tom: Evening.')
    ).toEqual({ name: 'Old Tom', rest: 'Evening.' });
  });

  it('ignores text that already had the prefix, or is not a prefix', () => {
    expect(namePrefixFromInput(stateIn(doc(p('Note: x')), 0), 'y')).toBeNull();
    expect(
      namePrefixFromInput(stateIn(doc(p('It was late:')), 0), ' ')
    ).toBeNull();
    expect(namePrefixFromInput(stateIn(doc(p('Mara')), 0), ' ')).toBeNull();
    expect(namePrefixFromInput(stateIn(doc(p('mara:')), 0), ' ')).toBeNull();
    expect(
      namePrefixFromInput(stateIn(doc(p('A Very Long Name Here:')), 0), ' ')
    ).toBeNull();
  });

  it('accepts numbered and uncased names', () => {
    expect(
      namePrefixFromInput(stateIn(doc(p('Guard #2:')), 0), ' ')?.name
    ).toBe('Guard #2');
    expect(namePrefixFromInput(stateIn(doc(p('美咲:')), 0), ' ')?.name).toBe(
      '美咲'
    );
  });

  it('works at the start of a line but not inside a note', () => {
    const d = doc(line(TOMAS, 'Mara:', ''));
    expect(namePrefixFromInput(stateIn(d, 0), ' ')?.name).toBe('Mara');
    expect(
      namePrefixFromInput(stateIn(d, 0, 0, 'parenthetical'), 'Ana: ')
    ).toBeNull();
  });

  it('turns a description into a line by that speaker', () => {
    const d = doc(p('Mara:'));
    const next = run(stateIn(d, 0), applyNameLine(MARA, 'Hi'))!;
    expect(outline(next.doc)).toEqual(['>Mara: Hi']);
    expect(next.selection.$from.parentOffset).toBe(2);
  });

  it('keeps text after the cursor', () => {
    const d = doc(p('Mara:later'));
    const next = run(stateIn(d, 0, 5), applyNameLine(MARA, ''))!;
    expect(outline(next.doc)).toEqual(['>Mara: later']);
  });

  it('gives an existing line to the speaker', () => {
    const d = doc(line(TOMAS, 'Mara:rest'));
    const next = run(stateIn(d, 0, 5), applyNameLine(MARA, 'Hi '))!;
    expect(outline(next.doc)).toEqual(['>Mara: Hi rest']);
    expect(next.selection.$from.parentOffset).toBe(3);
  });

  it('refuses inside nested blocks', () => {
    const quote = schema.nodes['blockquote'].create(null, p('Mara:'));
    const d = doc(quote);
    const state = EditorState.create({
      doc: d,
      selection: TextSelection.create(d, 7),
    });
    expect(run(state, applyNameLine(MARA, ''))).toBeNull();
  });
});
