import { isDevMode } from '@angular/core';
import { type LintApiService } from '@services/lint/lint-api.service';
import { type Node } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { debounceTime, Subject, type Subscription } from 'rxjs';

import { type ExtendedCorrectionDto } from './correction-dto.extension';
import { LintStorageService } from './lint-storage.service';

// Store the plugin state
export interface LintState {
  decos: DecorationSet;
  reqId: number;
  suggestions: ExtendedCorrectionDto[];
}

// Export the plugin key for testing and state access
export const pluginKey = new PluginKey<LintState>('lint');

function lintDebugLog(...args: unknown[]): void {
  if (isDevMode()) {
    console.debug(...args);
  }
}

function lintDebugWarn(...args: unknown[]): void {
  if (isDevMode()) {
    console.warn(...args);
  }
}

/** Preserve leading/trailing whitespace from original text in a suggestion */
export function preserveWhitespace(
  originalText: string,
  suggestion: string
): string {
  let result = suggestion;

  const leadingLen = originalText.length - originalText.trimStart().length;
  if (leadingLen > 0 && !/^\s/.test(result)) {
    result = originalText.slice(0, leadingLen) + result;
  }

  const trailingLen = originalText.length - originalText.trimEnd().length;
  if (trailingLen > 0 && !/\s$/.test(result)) {
    result = result + originalText.slice(originalText.length - trailingLen);
  }

  return result;
}

/**
 * Apply an accepted correction to the given editor view.
 *
 * `correction.from` / `correction.to` are ProseMirror document positions
 * computed when the decoration was created, so they are used directly.
 */
export function handleAcceptCorrection(
  view: EditorView,
  correction: ExtendedCorrectionDto
): void {
  if (!correction?.correctedText) return;

  lintDebugLog('[LintPlugin] Applying correction');

  const from = correction.from;
  const to = correction.to;

  if (
    typeof from !== 'number' ||
    typeof to !== 'number' ||
    !Number.isFinite(from) ||
    !Number.isFinite(to)
  ) {
    lintDebugWarn('[LintPlugin] Invalid non-finite correction range');
    return;
  }

  let start = from;
  let end = to;

  // Validate positions against document size
  const docSize = view.state.doc.content.size;
  if (start < 0) start = 0;
  if (end > docSize) end = docSize;

  if (start >= end) {
    lintDebugWarn('[LintPlugin] Invalid correction range after clamping');
    return;
  }

  lintDebugLog(`[LintPlugin] Applying range ${start}-${end}`);

  // Preserve leading/trailing whitespace from the original document text
  const originalText = correction.text ?? '';
  const suggestion = preserveWhitespace(originalText, correction.correctedText);

  lintDebugLog('[LintPlugin] Suggestion prepared');

  // Replace the text precisely at the correction bounds
  const tr = view.state.tr.replaceWith(
    start,
    end,
    view.state.schema.text(suggestion)
  );

  // Reset the selection to the end of the inserted text
  const newPos = start + suggestion.length;
  tr.setSelection(TextSelection.create(tr.doc, newPos, newPos));

  view.dispatch(tr);
}

/**
 * Entry in a paragraph's char-offset -> document-position map.
 * `charStart` is the offset of this text run within the paragraph's
 * `textContent`; `pos` is the ProseMirror document position of its first char.
 */
interface OffsetMapEntry {
  charStart: number;
  pos: number;
}

/**
 * Build a map from paragraph `textContent` char offsets to ProseMirror document
 * positions for a single text block. Non-text inline nodes (e.g. images) occupy
 * document positions but contribute nothing to `textContent`, so mapping back
 * via the text runs skips them correctly.
 *
 * @param block   A textblock node (e.g. paragraph / heading)
 * @param basePos Document position immediately before the block
 */
function buildParagraphOffsetMap(
  block: Node,
  basePos: number
): OffsetMapEntry[] {
  const map: OffsetMapEntry[] = [];
  let cumulative = 0;
  block.descendants((child, relPos) => {
    if (child.isText && child.text) {
      map.push({ charStart: cumulative, pos: basePos + 1 + relPos });
      cumulative += child.text.length;
    }
    return true;
  });
  return map;
}

/**
 * Convert a char offset within a paragraph's `textContent` into a ProseMirror
 * document position using the offset map. Returns `null` if the offset is out
 * of range (e.g. the model returned a position past the end of the text).
 */
function charOffsetToDocPos(
  map: OffsetMapEntry[],
  offset: number
): number | null {
  if (map.length === 0 || offset < 0) return null;
  let lo = 0;
  let hi = map.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (map[mid].charStart <= offset) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (ans === -1) return null;
  const entry = map[ans];
  return entry.pos + (offset - entry.charStart);
}

/** Plugin metadata used to push new decorations into the plugin state. */
interface LintDecorationsMeta {
  type: 'decorations';
  corrections: ExtendedCorrectionDto[];
  reqId: number;
}

/** Plugin metadata used to re-filter existing suggestions (e.g. after a reject). */
interface LintRedecorateMeta {
  type: 'redecorate';
  reqId: number;
}

type LintMeta = LintDecorationsMeta | LintRedecorateMeta;

function isLintMeta(meta: unknown): meta is LintMeta {
  if (typeof meta !== 'object' || meta === null) return false;
  const m = meta as {
    type?: unknown;
    reqId?: unknown;
    corrections?: unknown;
  };
  if (typeof m.reqId !== 'number') return false;
  if (m.type === 'redecorate') return true;
  if (m.type === 'decorations') return Array.isArray(m.corrections);
  return false;
}

/**
 * Create a ProseMirror plugin for linting paragraphs.
 *
 * Lints each top-level textblock independently (the backend `lintParagraph`
 * endpoint accepts a single paragraph, capped at 4096 chars) and maps each
 * returned correction onto the correct ProseMirror document position.
 *
 * @param lintApi The API service for linting
 * @returns A ProseMirror plugin
 */
export function createLintPlugin(lintApi: LintApiService): Plugin<LintState> {
  const textUpdates = new Subject<Node>();
  let subscription: Subscription | null = null;
  const lintStorage = new LintStorageService();
  // Monotonic counter for all decoration dispatches so stale async results are
  // always superseded by newer ones, regardless of in-flight ordering.
  let reqCounter = 0;
  let view: EditorView | null = null;

  const handleAcceptEvent = (event: Event): void => {
    if (!view) return;
    const detail = (event as CustomEvent<ExtendedCorrectionDto>).detail;
    if (detail) {
      handleAcceptCorrection(view, detail);
    }
  };

  const handleRejectEvent = (event: Event): void => {
    if (!view) return;
    const detail = (event as CustomEvent<ExtendedCorrectionDto>).detail;
    if (!detail) return;
    lintStorage.rejectSuggestion(detail);
    const tr = view.state.tr.setMeta(pluginKey, {
      type: 'redecorate' as const,
      reqId: ++reqCounter,
    });
    view.dispatch(tr);
  };

  /**
   * Lint every textblock in the document and dispatch a single decorations
   * transaction with the combined, doc-positioned suggestions.
   */
  async function lintDocument(doc: Node): Promise<void> {
    if (!view) return;

    const myReqId = ++reqCounter;

    // Collect lintable textblocks up front so we don't read stale doc state
    // after awaiting the API calls.
    const blocks: { text: string; map: OffsetMapEntry[] }[] = [];
    doc.forEach((block, offset) => {
      if (!block.isTextblock) return;
      const text = block.textContent;
      if (!text || !text.trim() || text.length > 4096) return;
      const map = buildParagraphOffsetMap(block, offset);
      if (map.length === 0) return;
      blocks.push({ text, map });
    });

    if (blocks.length === 0) return;

    const results = await Promise.all(
      blocks.map(b => lintApi.run(b.text).catch(() => null))
    );

    // Drop this result if a newer lint cycle (or a reject) has landed.
    const currentReqId = pluginKey.getState(view.state)?.reqId ?? 0;
    if (myReqId < currentReqId) {
      lintDebugLog('[LintPlugin] Stale lint result discarded');
      return;
    }

    const allSuggestions: ExtendedCorrectionDto[] = [];
    const docSize = doc.content.size;

    results.forEach((res, idx) => {
      if (!res?.corrections) return;
      const { map } = blocks[idx];
      for (const correction of res.corrections) {
        const from = charOffsetToDocPos(map, correction.startPos ?? 0);
        const to = charOffsetToDocPos(map, correction.endPos ?? 0);
        if (from === null || to === null) continue;

        let start = from;
        let end = to;
        if (start < 0) start = 0;
        if (end > docSize) end = docSize;
        if (start >= end) continue;

        allSuggestions.push({
          ...correction,
          from: start,
          to: end,
          text: doc.textBetween(start, end),
          reason: correction.recommendation || '',
        });
      }
    });

    if (!view) return;
    const tr = view.state.tr.setMeta(pluginKey, {
      type: 'decorations' as const,
      corrections: allSuggestions,
      reqId: myReqId,
    });
    view.dispatch(tr);
  }

  function createDecorations(
    doc: Node,
    suggestions: ExtendedCorrectionDto[]
  ): { decos: DecorationSet; suggestions: ExtendedCorrectionDto[] } {
    if (!suggestions || suggestions.length === 0) {
      lintDebugLog('[LintPlugin] No corrections found in lint result');
      return { decos: DecorationSet.empty, suggestions: [] };
    }

    // Filter out rejected suggestions (stable ID, see LintStorageService)
    const filtered = suggestions.filter(
      s => !lintStorage.isSuggestionRejected(s)
    );

    lintDebugLog(
      `[LintPlugin] Filtered ${suggestions.length - filtered.length} rejected suggestions`
    );

    const active: ExtendedCorrectionDto[] = [];
    const decos = filtered
      .map((suggestion): Decoration | null => {
        const fromRaw = suggestion.from;
        const toRaw = suggestion.to;

        if (
          typeof fromRaw !== 'number' ||
          typeof toRaw !== 'number' ||
          !Number.isFinite(fromRaw) ||
          !Number.isFinite(toRaw)
        ) {
          lintDebugWarn('[LintPlugin] Invalid non-finite decoration range');
          return null;
        }

        let start = fromRaw;
        let end = toRaw;
        const docSize = doc.content.size;
        if (start < 0) start = 0;
        if (end > docSize) end = docSize;
        if (start >= end) {
          lintDebugWarn('[LintPlugin] Invalid range detected, from >= to');
          return null;
        }

        const extended: ExtendedCorrectionDto = {
          ...suggestion,
          from: start,
          to: end,
        };
        active.push(extended);

        lintDebugLog(
          `[LintPlugin] Creating decoration from ${start} to ${end}`
        );

        return Decoration.inline(start, end, {
          class: 'lint-error',
          'data-correction': JSON.stringify(extended),
        });
      })
      .filter((d): d is Decoration => d !== null);

    lintDebugLog(`[LintPlugin] Created ${decos.length} decorations`);
    return {
      decos: DecorationSet.create(doc, decos),
      suggestions: active,
    };
  }

  return new Plugin<LintState>({
    key: pluginKey,

    state: {
      init(): LintState {
        return {
          decos: DecorationSet.empty,
          reqId: 0,
          suggestions: [],
        };
      },
      apply(tr, prev: LintState, _oldState, newState): LintState {
        const meta: unknown = tr.getMeta(pluginKey);
        if (isLintMeta(meta) && meta.reqId >= prev.reqId) {
          if (meta.type === 'decorations') {
            const result = createDecorations(newState.doc, meta.corrections);
            return {
              decos: result.decos,
              reqId: meta.reqId,
              suggestions: result.suggestions,
            };
          }
          // redecorate: re-filter the existing suggestions without a new API
          // call. This removes a just-rejected suggestion immediately.
          const result = createDecorations(newState.doc, prev.suggestions);
          return {
            decos: result.decos,
            reqId: meta.reqId,
            suggestions: result.suggestions,
          };
        }

        // If content changed, keep current reqId to track state
        if (tr.docChanged) {
          textUpdates.next(newState.doc);
        }

        // Map decorations through document changes
        return {
          decos: prev.decos.map(tr.mapping, tr.doc),
          reqId: prev.reqId,
          suggestions: prev.suggestions,
        };
      },
    },

    props: {
      decorations(state) {
        const pluginState = pluginKey.getState(state);
        if (pluginState?.decos) {
          const allDecos = pluginState.decos.find();
          lintDebugLog(
            `[LintPlugin] Returning ${allDecos.length} decorations for rendering`
          );
        }
        return pluginState?.decos;
      },
    },

    view(editorView) {
      view = editorView;
      lintDebugLog('[LintPlugin] Initializing lint plugin view');

      // Attach stable listeners so they can be removed cleanly on destroy.
      // addEventListener dedups identical refs, so repeated view() calls are safe.
      document.addEventListener('lint-accept', handleAcceptEvent);
      document.addEventListener('lint-reject', handleRejectEvent);

      // Replace any existing subscription so repeated view() calls don't stack
      // up multiple lint cycles on the same Subject.
      if (subscription) {
        subscription.unsubscribe();
      }
      subscription = textUpdates.pipe(debounceTime(500)).subscribe(doc => {
        void lintDocument(doc);
      });

      return {
        update(viewArg, prevState) {
          if (viewArg.state.doc !== prevState.doc) {
            textUpdates.next(viewArg.state.doc);
          }
        },
        destroy() {
          lintDebugLog('[LintPlugin] Destroying lint plugin subscription');
          if (subscription) {
            subscription.unsubscribe();
            subscription = null;
          }
          document.removeEventListener('lint-accept', handleAcceptEvent);
          document.removeEventListener('lint-reject', handleRejectEvent);
          view = null;
        },
      };
    },
  });
}

// Helper function used to check if cursor is in a suggestion. Uses the
// ProseMirror document positions (`from` / `to`) stored on the extended
// correction.
export function findSuggestionAtPos(
  pos: number,
  suggestions: ExtendedCorrectionDto[]
): ExtendedCorrectionDto | null {
  for (const suggestion of suggestions) {
    const from = suggestion.from ?? suggestion.startPos;
    const to = suggestion.to ?? suggestion.endPos;
    if (from <= pos && pos <= to) {
      return suggestion;
    }
  }
  return null;
}
