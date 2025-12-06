/**
 * Element Reference Plugin for ProseMirror
 *
 * This plugin handles:
 * - Detecting @ trigger character
 * - Managing the search popup state
 * - Inserting elementRef nodes
 * - Click handling on existing refs
 */

import {
  EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';

import { ElementRefClickEvent, ElementRefNodeAttrs } from './element-ref.model';
import { ELEMENT_REF_NODE_NAME } from './element-ref-schema';
import type { ElementRefTooltipData } from './element-ref-tooltip/element-ref-tooltip.component';

// ─────────────────────────────────────────────────────────────────────────────
// Plugin State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * State maintained by the element ref plugin
 */
export interface ElementRefPluginState {
  /** Whether we're currently in @ mention mode */
  active: boolean;
  /** Position where @ was typed (for deletion on cancel) */
  triggerPos: number | null;
  /** Current search query (characters after @) */
  query: string;
  /** Screen coordinates for popup positioning */
  popupPosition: { x: number; y: number } | null;
  /** Decorations for highlighting the @ trigger */
  decorations: DecorationSet;
}

/**
 * Plugin key for accessing element ref plugin state
 */
export const elementRefPluginKey = new PluginKey<ElementRefPluginState>(
  'elementRef'
);

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Actions
// ─────────────────────────────────────────────────────────────────────────────

type PluginAction =
  | {
      type: 'activate';
      triggerPos: number;
      popupPosition: { x: number; y: number };
    }
  | { type: 'updateQuery'; query: string }
  | { type: 'deactivate' }
  | { type: 'insert'; attrs: ElementRefNodeAttrs };

// ─────────────────────────────────────────────────────────────────────────────
// Event Callbacks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callbacks for communicating with the Angular component
 */
export interface ElementRefPluginCallbacks {
  /** Called when popup should open */
  onOpen: (position: { x: number; y: number }, query: string) => void;
  /** Called when popup should close */
  onClose: () => void;
  /** Called when query changes */
  onQueryChange: (query: string) => void;
  /** Called when a ref is clicked */
  onRefClick: (event: ElementRefClickEvent) => void;
  /** Called when hovering over a ref (for tooltip) */
  onRefHover?: (data: ElementRefTooltipData) => void;
  /** Called when hover ends */
  onRefHoverEnd?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the element reference plugin
 */
export function createElementRefPlugin(
  callbacks: ElementRefPluginCallbacks
): Plugin<ElementRefPluginState> {
  return new Plugin<ElementRefPluginState>({
    key: elementRefPluginKey,

    // ─────────────────────────────────────────────────────────────────────────
    // State Management
    // ─────────────────────────────────────────────────────────────────────────

    state: {
      init(): ElementRefPluginState {
        return {
          active: false,
          triggerPos: null,
          query: '',
          popupPosition: null,
          decorations: DecorationSet.empty,
        };
      },

      apply(
        tr: Transaction,
        state: ElementRefPluginState,
        _oldState: EditorState,
        newState: EditorState
      ): ElementRefPluginState {
        // Check for plugin actions in transaction meta
        const action = tr.getMeta(elementRefPluginKey) as
          | PluginAction
          | undefined;

        if (action) {
          switch (action.type) {
            case 'activate':
              return {
                active: true,
                triggerPos: action.triggerPos,
                query: '',
                popupPosition: action.popupPosition,
                decorations: createTriggerDecoration(
                  newState,
                  action.triggerPos
                ),
              };

            case 'updateQuery':
              return {
                ...state,
                query: action.query,
                decorations: state.triggerPos
                  ? createTriggerDecoration(
                      newState,
                      state.triggerPos,
                      action.query.length
                    )
                  : state.decorations,
              };

            case 'deactivate':
              return {
                active: false,
                triggerPos: null,
                query: '',
                popupPosition: null,
                decorations: DecorationSet.empty,
              };

            case 'insert':
              // Insertion is handled in handleSelect, just deactivate here
              return {
                active: false,
                triggerPos: null,
                query: '',
                popupPosition: null,
                decorations: DecorationSet.empty,
              };
          }
        }

        // If not active, nothing to update
        if (!state.active) {
          return state;
        }

        // Map decorations through document changes
        const decorations = state.decorations.map(tr.mapping, tr.doc);

        // Check if cursor moved away from trigger position
        if (tr.docChanged || tr.selectionSet) {
          const { $from } = newState.selection;

          // If cursor is before trigger position, deactivate
          if (state.triggerPos !== null && $from.pos < state.triggerPos) {
            callbacks.onClose();
            return {
              active: false,
              triggerPos: null,
              query: '',
              popupPosition: null,
              decorations: DecorationSet.empty,
            };
          }

          // Update query based on text between trigger and cursor
          if (state.triggerPos !== null) {
            const query = newState.doc.textBetween(
              state.triggerPos + 1, // +1 to skip the @
              $from.pos
            );

            // Check for space or newline (ends the mention)
            if (query.includes(' ') || query.includes('\n')) {
              callbacks.onClose();
              return {
                active: false,
                triggerPos: null,
                query: '',
                popupPosition: null,
                decorations: DecorationSet.empty,
              };
            }

            if (query !== state.query) {
              callbacks.onQueryChange(query);
              return {
                ...state,
                query,
                decorations: createTriggerDecoration(
                  newState,
                  state.triggerPos,
                  query.length
                ),
              };
            }
          }
        }

        return {
          ...state,
          decorations,
        };
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Props
    // ─────────────────────────────────────────────────────────────────────────

    props: {
      // Provide decorations for highlighting
      decorations(state: EditorState): DecorationSet {
        const pluginState = elementRefPluginKey.getState(state);
        return pluginState?.decorations || DecorationSet.empty;
      },

      // Handle key events
      handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
        const state = elementRefPluginKey.getState(view.state);

        // Escape closes the popup
        if (event.key === 'Escape' && state?.active) {
          closePopup(view);
          return true;
        }

        return false;
      },

      // Handle text input
      handleTextInput(
        view: EditorView,
        from: number,
        to: number,
        text: string
      ): boolean {
        // Check for @ trigger
        if (text === '@') {
          const state = elementRefPluginKey.getState(view.state);

          // Don't trigger if already active
          if (state?.active) {
            return false;
          }

          // Get cursor screen coordinates for popup positioning
          const coords = view.coordsAtPos(from);
          const popupPosition = {
            x: coords.left,
            y: coords.bottom + 4, // Slight offset below cursor
          };

          // Activate the plugin
          const tr = view.state.tr.setMeta(elementRefPluginKey, {
            type: 'activate',
            triggerPos: from,
            popupPosition,
          } as PluginAction);

          view.dispatch(tr);

          // Notify Angular component
          callbacks.onOpen(popupPosition, '');

          return false; // Let the @ be inserted normally
        }

        return false;
      },

      // Handle clicks on element refs (left click for editing)
      handleClick(view: EditorView, pos: number, event: MouseEvent): boolean {
        const { doc } = view.state;
        const $pos = doc.resolve(pos);
        const node = $pos.nodeAfter;

        // Check if we clicked on an elementRef node
        if (node?.type.name === ELEMENT_REF_NODE_NAME) {
          const attrs = node.attrs as ElementRefNodeAttrs;

          callbacks.onRefClick({
            elementId: attrs.elementId,
            elementType: attrs.elementType,
            displayText: attrs.displayText,
            originalName: attrs.originalName,
            relationshipId: attrs.relationshipId,
            nodePos: pos,
            mouseEvent: event,
            isContextMenu: false,
          });

          return true;
        }

        return false;
      },

      // Handle DOM events for right-click and long-press
      handleDOMEvents: {
        // Right-click context menu
        contextmenu(view: EditorView, event: MouseEvent): boolean {
          const pos = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          if (!pos) return false;

          const { doc } = view.state;
          const $pos = doc.resolve(pos.pos);
          const node = $pos.nodeAfter;

          if (node?.type.name === ELEMENT_REF_NODE_NAME) {
            event.preventDefault();
            const attrs = node.attrs as ElementRefNodeAttrs;

            callbacks.onRefClick({
              elementId: attrs.elementId,
              elementType: attrs.elementType,
              displayText: attrs.displayText,
              originalName: attrs.originalName,
              relationshipId: attrs.relationshipId,
              nodePos: pos.pos,
              mouseEvent: event,
              isContextMenu: true,
            });

            return true;
          }

          return false;
        },

        // Touch start for long-press detection
        touchstart(view: EditorView, event: TouchEvent): boolean {
          if (event.touches.length !== 1) return false;

          const touch = event.touches[0];
          const pos = view.posAtCoords({
            left: touch.clientX,
            top: touch.clientY,
          });
          if (!pos) return false;

          const { doc } = view.state;
          const $pos = doc.resolve(pos.pos);
          const node = $pos.nodeAfter;

          if (node?.type.name === ELEMENT_REF_NODE_NAME) {
            // Set up long-press timer
            const attrs = node.attrs as ElementRefNodeAttrs;
            const nodePos = pos.pos;

            const longPressTimer = setTimeout(() => {
              event.preventDefault();
              // Create a synthetic mouse event for positioning
              const syntheticEvent = new MouseEvent('contextmenu', {
                clientX: touch.clientX,
                clientY: touch.clientY,
                bubbles: true,
              });

              callbacks.onRefClick({
                elementId: attrs.elementId,
                elementType: attrs.elementType,
                displayText: attrs.displayText,
                originalName: attrs.originalName,
                relationshipId: attrs.relationshipId,
                nodePos,
                mouseEvent: syntheticEvent,
                isContextMenu: true,
              });
            }, 500); // 500ms for long press

            // Clear timer on touch end or move
            const cleanup = () => {
              clearTimeout(longPressTimer);
              view.dom.removeEventListener('touchend', cleanup);
              view.dom.removeEventListener('touchmove', cleanup);
              view.dom.removeEventListener('touchcancel', cleanup);
            };

            view.dom.addEventListener('touchend', cleanup, { once: true });
            view.dom.addEventListener('touchmove', cleanup, { once: true });
            view.dom.addEventListener('touchcancel', cleanup, { once: true });
          }

          return false;
        },

        // Mouse over for tooltip
        mouseover(view: EditorView, event: MouseEvent): boolean {
          if (!callbacks.onRefHover) return false;

          const target = event.target as HTMLElement;
          const refSpan = target.closest('span[data-element-ref]');
          if (!refSpan) return false;

          // Get the node position
          const pos = view.posAtDOM(refSpan, 0);
          if (pos < 0) return false;

          const { doc } = view.state;
          const $pos = doc.resolve(pos);
          const node = $pos.nodeAfter;

          if (node?.type.name === ELEMENT_REF_NODE_NAME) {
            const attrs = node.attrs as ElementRefNodeAttrs;
            const rect = refSpan.getBoundingClientRect();

            callbacks.onRefHover({
              elementId: attrs.elementId,
              displayText: attrs.displayText,
              originalName: attrs.originalName,
              elementType: attrs.elementType,
              position: {
                x: rect.left + rect.width / 2,
                y: rect.bottom,
              },
            });

            return true;
          }

          return false;
        },

        // Mouse out to hide tooltip
        mouseout(view: EditorView, event: MouseEvent): boolean {
          if (!callbacks.onRefHoverEnd) return false;

          const target = event.target as HTMLElement;
          const refSpan = target.closest('span[data-element-ref]');
          if (!refSpan) return false;

          // Check if we're moving to the tooltip itself (don't hide)
          const relatedTarget = event.relatedTarget as HTMLElement | null;
          if (relatedTarget?.closest('.element-ref-tooltip')) return false;

          callbacks.onRefHoverEnd();
          return false;
        },
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a decoration to highlight the trigger text (@query)
 */
function createTriggerDecoration(
  state: EditorState,
  triggerPos: number,
  queryLength = 0
): DecorationSet {
  const from = triggerPos;
  const to = triggerPos + 1 + queryLength; // +1 for @

  // Make sure positions are valid
  if (from < 0 || to > state.doc.content.size) {
    return DecorationSet.empty;
  }

  const decoration = Decoration.inline(from, to, {
    class: 'element-ref-trigger',
  });

  return DecorationSet.create(state.doc, [decoration]);
}

/**
 * Close the popup and deactivate the plugin
 */
function closePopup(view: EditorView): void {
  const tr = view.state.tr.setMeta(elementRefPluginKey, {
    type: 'deactivate',
  } as PluginAction);
  view.dispatch(tr);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API for Angular Component Integration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert an element reference at the current trigger position
 */
export function insertElementRef(
  view: EditorView,
  attrs: ElementRefNodeAttrs
): boolean {
  const state = elementRefPluginKey.getState(view.state);

  if (!state?.active || state.triggerPos === null) {
    console.warn('[ElementRefPlugin] Cannot insert: not in active state');
    return false;
  }

  const schema = view.state.schema;
  const nodeType = schema.nodes[ELEMENT_REF_NODE_NAME];

  if (!nodeType) {
    console.error('[ElementRefPlugin] elementRef node type not in schema');
    return false;
  }

  // Create the elementRef node
  const node = nodeType.create(attrs);

  // Calculate the range to replace (@ + query)
  const from = state.triggerPos;
  const to = from + 1 + state.query.length; // +1 for @

  // Create transaction: replace trigger with node, then deactivate
  const tr = view.state.tr
    .replaceWith(from, to, node)
    .setMeta(elementRefPluginKey, { type: 'deactivate' } as PluginAction);

  // Move cursor after the inserted node
  const newPos = from + 1; // Position after the node
  tr.setSelection(TextSelection.create(tr.doc, newPos));

  view.dispatch(tr);
  view.focus();

  return true;
}

/**
 * Cancel the current mention and close the popup
 */
export function cancelElementRef(view: EditorView): void {
  const tr = view.state.tr.setMeta(elementRefPluginKey, {
    type: 'deactivate',
  } as PluginAction);
  view.dispatch(tr);
  view.focus();
}

/**
 * Get the current plugin state
 */
export function getElementRefState(
  state: EditorState
): ElementRefPluginState | undefined {
  return elementRefPluginKey.getState(state);
}

/**
 * Check if the popup is currently active
 */
export function isElementRefActive(state: EditorState): boolean {
  const pluginState = elementRefPluginKey.getState(state);
  return pluginState?.active ?? false;
}

/**
 * Update the display text of an element reference at the given position
 */
export function updateElementRefText(
  view: EditorView,
  nodePos: number,
  newText: string
): boolean {
  const { doc, schema } = view.state;

  // Resolve position and get the node
  const $pos = doc.resolve(nodePos);
  const node = $pos.nodeAfter;

  if (!node || node.type.name !== ELEMENT_REF_NODE_NAME) {
    console.warn('[ElementRefPlugin] No elementRef node at position', nodePos);
    return false;
  }

  // Create new node with updated displayText
  const newAttrs = {
    ...node.attrs,
    displayText: newText,
  };

  const newNode = schema.nodes[ELEMENT_REF_NODE_NAME].create(newAttrs);

  // Replace the old node with the new one
  const tr = view.state.tr.replaceWith(
    nodePos,
    nodePos + node.nodeSize,
    newNode
  );

  view.dispatch(tr);
  return true;
}

/**
 * Delete an element reference at the given position
 */
export function deleteElementRef(view: EditorView, nodePos: number): boolean {
  const { doc } = view.state;

  // Resolve position and get the node
  const $pos = doc.resolve(nodePos);
  const node = $pos.nodeAfter;

  if (!node || node.type.name !== ELEMENT_REF_NODE_NAME) {
    console.warn('[ElementRefPlugin] No elementRef node at position', nodePos);
    return false;
  }

  // Delete the node
  const tr = view.state.tr.delete(nodePos, nodePos + node.nodeSize);

  view.dispatch(tr);
  view.focus();
  return true;
}
