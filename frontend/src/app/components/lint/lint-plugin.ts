/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Node } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { debounceTime, Subject, Subscription } from 'rxjs';

import { CorrectionDto } from '../../../api-client/model/correction-dto';
import { LintResponseDto } from '../../../api-client/model/lint-response-dto';
import { LintApiService } from './lint-api.service';

// Store the plugin state
export interface LintState {
  decos: DecorationSet;
  reqId: number;
}

// Export the plugin key for testing and state access
export const pluginKey = new PluginKey<LintState>('lint');

/**
 * Create a ProseMirror plugin for linting paragraphs
 * @param lintApi The API service for linting
 * @returns A ProseMirror plugin
 */
export function createLintPlugin(lintApi: LintApiService): Plugin {
  const textUpdates = new Subject<Node>();
  let subscription: Subscription | null = null;

  // Creates an async subscription to handle text updates with debounce
  const createSubscription = (view: EditorView) => {
    // Clear any existing subscription
    if (subscription) {
      subscription.unsubscribe();
    }

    subscription = textUpdates.pipe(debounceTime(500)).subscribe(doc => {
      void (async () => {
        try {
          const text = doc.textContent;
          console.log(
            '[LintPlugin] Sending text for linting:',
            text.substring(0, 50) + '...'
          );
          const result = await lintApi.run(text);
          console.log('[LintPlugin] Received lint result:', result);
          const pluginState = pluginKey.getState(view.state);
          const tr = view.state.tr.setMeta(pluginKey, {
            type: 'decorations',
            res: result,
            reqId: (pluginState?.reqId || 0) + 1,
          });
          view.dispatch(tr);
        } catch (error) {
          console.error('Error in lint plugin:', error);
        }
      })();
    });
  };

  // Create decorations from lint results
  function createDecorations(
    doc: Node,
    lintResult: LintResponseDto
  ): DecorationSet {
    if (
      !lintResult ||
      !Array.isArray(lintResult.corrections) ||
      lintResult.corrections.length === 0
    ) {
      console.log('[LintPlugin] No corrections found in lint result');
      return DecorationSet.empty;
    }

    console.log(
      '[LintPlugin] Creating decorations for corrections:',
      lintResult.corrections
    );

    const decos = lintResult.corrections
      .map((correction: CorrectionDto) => {
        let reasonText = '';

        // Handle both formats of corrections (server might send 'error' or 'reason')
        if ('reason' in correction && typeof correction.reason === 'string') {
          reasonText = `\n${correction.reason}`;
        } else if (
          'error' in correction &&
          typeof correction.error === 'string'
        ) {
          reasonText = `\nError: ${correction.error}`;
        }

        // Ensure we have from and to properties
        const from = typeof correction.from === 'number' ? correction.from : 0;
        const to = typeof correction.to === 'number' ? correction.to : 0;

        if (from === to || from < 0 || to <= 0) {
          console.warn('[LintPlugin] Invalid correction range:', correction);
          return null; // Skip invalid decorations
        }

        console.log(
          `[LintPlugin] Creating decoration from ${from} to ${to} with suggestion: ${correction.suggestion}`
        );

        return Decoration.inline(from, to, {
          class: 'lint-error',
          title: `Suggestion: ${correction.suggestion}${reasonText}`,
          'data-correction': correction.suggestion,
        });
      })
      .filter(Boolean) as Decoration[]; // Remove null values

    console.log(`[LintPlugin] Created ${decos.length} decorations`);
    return DecorationSet.create(doc, decos);
  }

  return new Plugin({
    key: pluginKey,

    state: {
      init() {
        return {
          decos: DecorationSet.empty,
          reqId: 0,
        };
      },
      apply(tr, prev, oldState, newState) {
        // Handle decorations metadata
        const meta = tr.getMeta(pluginKey);
        if (meta && typeof meta === 'object') {
          // Check for proper metadata structure with type safety
          interface DecorationMeta {
            type: string;
            res: LintResponseDto;
            reqId: number;
          }

          const isDecorationMeta = (m: any): m is DecorationMeta => {
            return (
              'type' in m &&
              m.type === 'decorations' &&
              'reqId' in m &&
              typeof m.reqId === 'number' &&
              'res' in m &&
              m.res !== null &&
              m.res !== undefined
            );
          };

          if (isDecorationMeta(meta)) {
            // Only update if the reqId is greater than or equal to current
            // (prevents old async results from overwriting newer ones)
            if (meta.reqId >= prev.reqId) {
              console.log('[LintPlugin] Applying new decorations from meta');
              return {
                decos: createDecorations(newState.doc, meta.res),
                reqId: meta.reqId,
              };
            }
          }
        }

        // If content changed, keep current reqId to track state
        if (tr.docChanged) {
          textUpdates.next(newState.doc);
        }

        // Map decorations through document changes
        return {
          decos: prev.decos.map(tr.mapping, tr.doc),
          reqId: prev.reqId,
        };
      },
    },

    props: {
      decorations(state) {
        const decos = pluginKey.getState(state)?.decos;
        if (decos) {
          const allDecos = decos.find();
          console.log(
            `[LintPlugin] Returning ${allDecos.length} decorations for rendering`
          );
        }
        return decos;
      },

      handleClick(_view, pos) {
        const state = _view.state;
        const decos = pluginKey.getState(state)?.decos;
        if (!decos) return false;

        const found = decos.find(pos, pos);
        if (found.length === 0) return false;

        const node = _view.nodeDOM(pos);
        if (!node || !(node instanceof HTMLElement)) return false;

        // Apply the correction
        if (node.classList.contains('lint-error')) {
          // Get correction from data attribute or decoration spec
          const correction =
            node.getAttribute('data-correction') ||
            (found[0].spec &&
            typeof found[0].spec === 'object' &&
            'data-correction' in found[0].spec
              ? String(found[0].spec['data-correction'])
              : null);

          if (correction) {
            console.log(`[LintPlugin] Applying correction: ${correction}`);
            const from = found[0].from;
            const to = found[0].to;
            const tr = state.tr.replaceWith(
              from,
              to,
              state.schema.text(correction)
            );
            _view.dispatch(tr);
            return true;
          }
        }

        return false;
      },
    },

    view(editorView) {
      // Set up the subscription when the plugin starts
      console.log('[LintPlugin] Initializing lint plugin view');
      createSubscription(editorView);

      return {
        update(view, prevState) {
          // Check if doc has changed
          if (view.state.doc !== prevState.doc) {
            textUpdates.next(view.state.doc);
          }
        },
        destroy() {
          console.log('[LintPlugin] Destroying lint plugin subscription');
          if (subscription) {
            subscription.unsubscribe();
            subscription = null;
          }
        },
      };
    },
  });
}
