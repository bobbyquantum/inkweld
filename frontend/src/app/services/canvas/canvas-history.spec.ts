import { describe, expect, it } from 'vitest';

import { UndoHistory } from './canvas-history';

describe('UndoHistory', () => {
  it('starts empty', () => {
    const history = new UndoHistory<string>();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.depth).toBe(0);
  });

  it('undo returns null when there is nothing recorded', () => {
    const history = new UndoHistory<string>();
    expect(history.undo('current')).toBeNull();
  });

  it('redo returns null when there is nothing to redo', () => {
    const history = new UndoHistory<string>();
    expect(history.redo('current')).toBeNull();
  });

  it('steps back through recorded states', () => {
    const history = new UndoHistory<string>();
    history.push('a');
    history.push('b');

    expect(history.undo('c')).toBe('b');
    expect(history.undo('b')).toBe('a');
    expect(history.canUndo).toBe(false);
  });

  it('replays undone states with redo', () => {
    const history = new UndoHistory<string>();
    history.push('a');

    expect(history.undo('b')).toBe('a');
    expect(history.canRedo).toBe(true);
    expect(history.redo('a')).toBe('b');
    expect(history.canRedo).toBe(false);
    expect(history.canUndo).toBe(true);
  });

  it('drops the redo branch when a new change is pushed', () => {
    const history = new UndoHistory<string>();
    history.push('a');
    history.undo('b');
    expect(history.canRedo).toBe(true);

    history.push('a2');
    expect(history.canRedo).toBe(false);
  });

  it('collapses consecutive pushes that share a coalesce key', () => {
    const history = new UndoHistory<string>();
    history.push('start', 'opacity');
    history.push('mid', 'opacity');
    history.push('nearly', 'opacity');

    expect(history.depth).toBe(1);
    expect(history.undo('end')).toBe('start');
  });

  it('treats a different coalesce key as a new step', () => {
    const history = new UndoHistory<string>();
    history.push('a', 'opacity');
    history.push('b', 'move');

    expect(history.depth).toBe(2);
  });

  it('treats an unkeyed push as a new step', () => {
    const history = new UndoHistory<string>();
    history.push('a', 'opacity');
    history.push('b');

    expect(history.depth).toBe(2);
  });

  it('clears the redo branch when a coalesced push arrives', () => {
    const history = new UndoHistory<string>();
    history.push('a', 'opacity');
    history.undo('b');
    history.push('a', 'opacity');

    expect(history.canRedo).toBe(false);
  });

  it('discards the oldest entries beyond the limit', () => {
    const history = new UndoHistory<number>(3);
    history.push(1);
    history.push(2);
    history.push(3);
    history.push(4);

    expect(history.depth).toBe(3);
    expect(history.undo(5)).toBe(4);
    expect(history.undo(4)).toBe(3);
    expect(history.undo(3)).toBe(2);
    expect(history.canUndo).toBe(false);
  });

  it('clearRedo leaves the undo stack intact', () => {
    const history = new UndoHistory<string>();
    history.push('a');
    history.push('b');
    history.undo('c');

    history.clearRedo();
    expect(history.canRedo).toBe(false);
    expect(history.canUndo).toBe(true);
  });

  it('clear forgets everything', () => {
    const history = new UndoHistory<string>();
    history.push('a');
    history.undo('b');

    history.clear();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});
