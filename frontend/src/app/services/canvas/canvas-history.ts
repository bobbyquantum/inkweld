/**
 * A bounded undo/redo stack of immutable state snapshots.
 *
 * Canvas configs are rebuilt immutably on every edit and share references for
 * everything that did not change, so snapshotting whole configs is cheap —
 * an undo step costs one array header, not a deep copy of the canvas.
 *
 * Deliberately framework-free: no signals, no DI, no Konva. The service that
 * owns the canvas config decides *when* to record; this only decides *what*
 * can be undone.
 */

/** Default number of undo steps retained. */
export const DEFAULT_HISTORY_LIMIT = 100;

interface HistoryEntry<T> {
  state: T;
  /**
   * Gesture identifier. Consecutive pushes sharing a key collapse into the
   * single snapshot taken before the gesture started, so dragging a slider
   * costs one undo step rather than one per pixel.
   */
  coalesceKey?: string;
}

export class UndoHistory<T> {
  private past: HistoryEntry<T>[] = [];
  private future: HistoryEntry<T>[] = [];

  constructor(private readonly limit: number = DEFAULT_HISTORY_LIMIT) {}

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Number of undo steps currently retained (exposed for tests/debugging). */
  get depth(): number {
    return this.past.length;
  }

  /**
   * Record the state as it was *before* a change is applied.
   *
   * @param previous state to return to when the user undoes this change
   * @param coalesceKey when it matches the previous push, the two changes
   *   become a single undo step
   */
  push(previous: T, coalesceKey?: string): void {
    const top = this.past.at(-1);
    if (coalesceKey && top?.coalesceKey === coalesceKey) {
      // Same gesture — keep the older snapshot, it is the one worth undoing to.
      this.future = [];
      return;
    }

    this.past.push({ state: previous, coalesceKey });
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  /**
   * Step back one state. `current` is banked so it can be redone.
   * Returns `null` when there is nothing to undo.
   */
  undo(current: T): T | null {
    const entry = this.past.pop();
    if (!entry) return null;
    this.future.push({ state: current });
    return entry.state;
  }

  /**
   * Step forward one state. `current` is banked so it can be undone again.
   * Returns `null` when there is nothing to redo.
   */
  redo(current: T): T | null {
    const entry = this.future.pop();
    if (!entry) return null;
    this.past.push({ state: current });
    return entry.state;
  }

  /** Drop the redo branch — used when an unrelated change lands. */
  clearRedo(): void {
    this.future = [];
  }

  /** Forget everything, e.g. when switching to a different canvas. */
  clear(): void {
    this.past = [];
    this.future = [];
  }
}
