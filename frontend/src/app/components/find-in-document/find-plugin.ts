/**
 * Find in Document ProseMirror Plugin
 *
 * Provides search functionality with highlighting decorations for matches.
 * Designed for future extension to support replace functionality.
 */
import { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  Plugin,
  PluginKey,
  TextSelection,
  Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';

/**
 * State managed by the find plugin
 */
export interface FindPluginState {
  /** Current search query (empty string when closed) */
  query: string;
  /** Whether search is case sensitive */
  caseSensitive: boolean;
  /** All match positions in the document */
  matches: Array<{ from: number; to: number }>;
  /** Index of the currently highlighted match (-1 if no matches) */
  currentMatchIndex: number;
  /** Decorations for highlighting matches */
  decorations: DecorationSet;
}

/**
 * Meta actions for updating the plugin state via transactions
 */
export interface FindPluginMeta {
  /** Action type */
  action:
    | 'search'
    | 'nextMatch'
    | 'previousMatch'
    | 'close'
    | 'toggleCaseSensitive'
    | 'replace'
    | 'replaceAll';
  /** Search query (for 'search' action) */
  query?: string;
  /** Case sensitivity (for 'toggleCaseSensitive' action) */
  caseSensitive?: boolean;
  /** Replacement text (for 'replace' and 'replaceAll' actions) */
  replacement?: string;
}

/** Plugin key for accessing find state from editor state */
export const findPluginKey = new PluginKey<FindPluginState>('find');

/**
 * Find all matches of the query in the document
 */
function findMatches(
  doc: ProseMirrorNode,
  query: string,
  caseSensitive: boolean
): Array<{ from: number; to: number }> {
  const matches: Array<{ from: number; to: number }> = [];

  if (!query || query.length === 0) {
    return matches;
  }

  const searchQuery = caseSensitive ? query : query.toLowerCase();

  doc.descendants((node: ProseMirrorNode, pos: number) => {
    if (node.isText && node.text) {
      const nodeText = node.text;
      const text = caseSensitive ? nodeText : nodeText.toLowerCase();
      let index = 0;
      let foundIndex: number;

      while ((foundIndex = text.indexOf(searchQuery, index)) !== -1) {
        const from = pos + foundIndex;
        const to = from + query.length;
        matches.push({ from, to });
        index = foundIndex + 1; // Move past this match to find overlapping matches
      }
    }
    return true; // Continue descending
  });

  return matches;
}

/**
 * Create decorations for all matches
 */
function createDecorations(
  doc: ProseMirrorNode,
  matches: Array<{ from: number; to: number }>,
  currentMatchIndex: number
): DecorationSet {
  if (matches.length === 0) {
    return DecorationSet.empty;
  }

  const decorations = matches.map((match, index) => {
    const isCurrentMatch = index === currentMatchIndex;
    return Decoration.inline(match.from, match.to, {
      class: isCurrentMatch ? 'find-match find-match-current' : 'find-match',
    });
  });

  return DecorationSet.create(doc, decorations);
}

/**
 * Create initial empty state
 */
function createInitialState(): FindPluginState {
  return {
    query: '',
    caseSensitive: false,
    matches: [],
    currentMatchIndex: -1,
    decorations: DecorationSet.empty,
  };
}

/**
 * Apply a find action to the state
 */
function applyFindAction(
  state: FindPluginState,
  meta: FindPluginMeta,
  doc: ProseMirrorNode
): FindPluginState {
  switch (meta.action) {
    case 'search': {
      const query = meta.query ?? '';
      const matches = findMatches(doc, query, state.caseSensitive);
      const currentMatchIndex = matches.length > 0 ? 0 : -1;
      const decorations = createDecorations(doc, matches, currentMatchIndex);

      return {
        ...state,
        query,
        matches,
        currentMatchIndex,
        decorations,
      };
    }

    case 'nextMatch': {
      if (state.matches.length === 0) {
        return state;
      }
      const nextIndex = (state.currentMatchIndex + 1) % state.matches.length;
      const decorations = createDecorations(doc, state.matches, nextIndex);

      return {
        ...state,
        currentMatchIndex: nextIndex,
        decorations,
      };
    }

    case 'previousMatch': {
      if (state.matches.length === 0) {
        return state;
      }
      const prevIndex =
        (state.currentMatchIndex - 1 + state.matches.length) %
        state.matches.length;
      const decorations = createDecorations(doc, state.matches, prevIndex);

      return {
        ...state,
        currentMatchIndex: prevIndex,
        decorations,
      };
    }

    case 'toggleCaseSensitive': {
      const caseSensitive = meta.caseSensitive ?? !state.caseSensitive;
      // Re-search with new case sensitivity
      const matches = findMatches(doc, state.query, caseSensitive);
      const currentMatchIndex = matches.length > 0 ? 0 : -1;
      const decorations = createDecorations(doc, matches, currentMatchIndex);

      return {
        ...state,
        caseSensitive,
        matches,
        currentMatchIndex,
        decorations,
      };
    }

    case 'close': {
      return createInitialState();
    }

    case 'replace':
    case 'replaceAll': {
      // Replace actions don't change plugin state directly.
      // The actual replacement is done via separate transaction in dispatch functions.
      // After replacement, the plugin automatically re-searches due to docChanged handling.
      return state;
    }

    default:
      return state;
  }
}

/**
 * Creates the find in document ProseMirror plugin.
 *
 * The plugin manages search state and highlights matches with CSS classes:
 * - `.find-match`: All matches
 * - `.find-match-current`: The currently selected match
 *
 * @returns A ProseMirror plugin for find functionality
 */
export function createFindPlugin(): Plugin<FindPluginState> {
  return new Plugin<FindPluginState>({
    key: findPluginKey,

    state: {
      init(): FindPluginState {
        return createInitialState();
      },

      apply(
        tr: Transaction,
        state: FindPluginState,
        _oldState,
        newState
      ): FindPluginState {
        const meta = tr.getMeta(findPluginKey) as FindPluginMeta | undefined;

        if (meta) {
          return applyFindAction(state, meta, newState.doc);
        }

        // If document changed and we have an active search, re-run it
        if (tr.docChanged && state.query) {
          const matches = findMatches(
            newState.doc,
            state.query,
            state.caseSensitive
          );

          // Try to preserve current match position if possible
          let currentMatchIndex = -1;
          if (matches.length > 0) {
            if (state.currentMatchIndex < matches.length) {
              currentMatchIndex = state.currentMatchIndex;
            } else {
              currentMatchIndex = matches.length - 1;
            }
          }

          const decorations = createDecorations(
            newState.doc,
            matches,
            currentMatchIndex
          );

          return {
            ...state,
            matches,
            currentMatchIndex,
            decorations,
          };
        }

        // Map decorations through document changes
        if (tr.docChanged) {
          return {
            ...state,
            decorations: state.decorations.map(tr.mapping, newState.doc),
          };
        }

        return state;
      },
    },

    props: {
      decorations(state) {
        return findPluginKey.getState(state)?.decorations;
      },
    },
  });
}

/**
 * Helper functions for controlling the find plugin from external code
 */

/**
 * Dispatch a search action to the find plugin
 */
export function dispatchSearch(view: EditorView, query: string): void {
  const tr = view.state.tr.setMeta(findPluginKey, {
    action: 'search',
    query,
  } satisfies FindPluginMeta);
  view.dispatch(tr);

  // Scroll to first match if found
  const state = findPluginKey.getState(view.state);
  if (state && state.matches.length > 0 && state.currentMatchIndex >= 0) {
    scrollToMatch(view, state.matches[state.currentMatchIndex]);
  }
}

/**
 * Navigate to the next match
 */
export function dispatchNextMatch(view: EditorView): void {
  const tr = view.state.tr.setMeta(findPluginKey, {
    action: 'nextMatch',
  } satisfies FindPluginMeta);
  view.dispatch(tr);

  const state = findPluginKey.getState(view.state);
  if (state && state.matches.length > 0 && state.currentMatchIndex >= 0) {
    scrollToMatch(view, state.matches[state.currentMatchIndex]);
  }
}

/**
 * Navigate to the previous match
 */
export function dispatchPreviousMatch(view: EditorView): void {
  const tr = view.state.tr.setMeta(findPluginKey, {
    action: 'previousMatch',
  } satisfies FindPluginMeta);
  view.dispatch(tr);

  const state = findPluginKey.getState(view.state);
  if (state && state.matches.length > 0 && state.currentMatchIndex >= 0) {
    scrollToMatch(view, state.matches[state.currentMatchIndex]);
  }
}

/**
 * Close the find functionality
 */
export function dispatchClose(view: EditorView): void {
  const tr = view.state.tr.setMeta(findPluginKey, {
    action: 'close',
  } satisfies FindPluginMeta);
  view.dispatch(tr);
}

/**
 * Toggle case sensitivity
 */
export function dispatchToggleCaseSensitive(
  view: EditorView,
  caseSensitive: boolean
): void {
  const tr = view.state.tr.setMeta(findPluginKey, {
    action: 'toggleCaseSensitive',
    caseSensitive,
  } satisfies FindPluginMeta);
  view.dispatch(tr);

  // Scroll to first match if found
  const state = findPluginKey.getState(view.state);
  if (state && state.matches.length > 0 && state.currentMatchIndex >= 0) {
    scrollToMatch(view, state.matches[state.currentMatchIndex]);
  }
}

/**
 * Scroll the editor to show a match
 */
function scrollToMatch(
  view: EditorView,
  match: { from: number; to: number }
): void {
  // First, set selection and use ProseMirror's scrollIntoView
  const selection = TextSelection.create(view.state.doc, match.from, match.to);
  const tr = view.state.tr.setSelection(selection).scrollIntoView();
  view.dispatch(tr);

  // Also use native scrollIntoView on the DOM element for better container scrolling
  // Use setTimeout to ensure decorations are rendered first
  setTimeout(() => {
    const matchElement = view.dom.querySelector('.find-match-current');
    if (matchElement && typeof matchElement.scrollIntoView === 'function') {
      matchElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }
  }, 0);
}

/**
 * Get the current find state
 */
export function getFindState(view: EditorView): FindPluginState | undefined {
  return findPluginKey.getState(view.state);
}

/**
 * Replace the current match with the replacement text.
 * Returns true if a replacement was made, false otherwise.
 */
export function dispatchReplace(
  view: EditorView,
  replacement: string
): boolean {
  const state = findPluginKey.getState(view.state);
  if (!state || state.matches.length === 0 || state.currentMatchIndex < 0) {
    return false;
  }

  const match = state.matches[state.currentMatchIndex];

  // Create a transaction that replaces the text
  const tr = view.state.tr.replaceWith(
    match.from,
    match.to,
    replacement ? view.state.schema.text(replacement) : []
  );

  // Mark this transaction with metadata so the plugin knows a replace happened
  tr.setMeta(findPluginKey, {
    action: 'replace',
    replacement,
  } satisfies FindPluginMeta);

  view.dispatch(tr);

  // After replacement, the plugin will automatically re-search due to docChanged.
  // Scroll to the new current match if there is one.
  setTimeout(() => {
    const newState = findPluginKey.getState(view.state);
    if (
      newState &&
      newState.matches.length > 0 &&
      newState.currentMatchIndex >= 0
    ) {
      scrollToMatch(view, newState.matches[newState.currentMatchIndex]);
    }
  }, 0);

  return true;
}

/**
 * Replace all matches with the replacement text.
 * Returns the number of replacements made.
 */
export function dispatchReplaceAll(
  view: EditorView,
  replacement: string
): number {
  const state = findPluginKey.getState(view.state);
  if (!state || state.matches.length === 0) {
    return 0;
  }

  const matches = state.matches;
  const replaceCount = matches.length;

  // Create a transaction that replaces all matches.
  // We need to replace from the end to avoid position shifts affecting earlier replacements.
  let tr = view.state.tr;

  // Sort matches by position descending (from end to start)
  const sortedMatches = [...matches].sort((a, b) => b.from - a.from);

  for (const match of sortedMatches) {
    tr = tr.replaceWith(
      match.from,
      match.to,
      replacement ? view.state.schema.text(replacement) : []
    );
  }

  // Mark this transaction with metadata
  tr.setMeta(findPluginKey, {
    action: 'replaceAll',
    replacement,
  } satisfies FindPluginMeta);

  view.dispatch(tr);

  return replaceCount;
}
