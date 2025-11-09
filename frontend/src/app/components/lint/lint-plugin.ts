/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Node } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { debounceTime, Subject, Subscription } from 'rxjs';

import { CorrectionDto } from '../../../api-client/model/correction-dto';
import { PostLint200Response } from '../../../api-client/model/post-lint200-response';
import { ExtendedCorrectionDto } from './correction-dto.extension';
import { LintApiService } from './lint-api.service';
import { LintStorageService } from './lint-storage.service';

// Store the plugin state
export interface LintState {
  decos: DecorationSet;
  reqId: number;
  suggestions: ExtendedCorrectionDto[];
}

// Export the plugin key for testing and state access
export const pluginKey = new PluginKey<LintState>('lint');

/**
 * Create a ProseMirror plugin for linting paragraphs
 * @param lintApi The API service for linting
 * @returns A ProseMirror plugin
 */
export function createLintPlugin(lintApi: LintApiService): Plugin<LintState> {
  const textUpdates = new Subject<Node>();
  let subscription: Subscription | null = null;
  const lintStorage = new LintStorageService();

  // Creates an async subscription to handle text updates with debounce
  const createSubscription = (view: EditorView) => {
    // Clear any existing subscription
    if (subscription) {
      subscription.unsubscribe();
    }

    // Listen for custom events for accepting corrections
    document.addEventListener('lint-accept', (event: Event) => {
      const customEvent = event as CustomEvent<ExtendedCorrectionDto>;
      if (customEvent.detail) {
        handleAcceptCorrection(view, customEvent.detail);
      }
    });

    // Listen for custom events for rejecting corrections
    document.addEventListener('lint-reject', (event: Event) => {
      const customEvent = event as CustomEvent<ExtendedCorrectionDto>;
      if (customEvent.detail) {
        // The storage service will handle storing the rejected correction
        lintStorage.rejectSuggestion(customEvent.detail);

        // Reapply decorations to remove the rejected suggestion
        const pluginState = pluginKey.getState(view.state);
        const tr = view.state.tr.setMeta(pluginKey, {
          type: 'redecorate',
          reqId: (pluginState?.reqId || 0) + 1,
        });
        view.dispatch(tr);
      }
    });

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

  // Apply an accepted correction
  function handleAcceptCorrection(
    view: EditorView,
    correction: ExtendedCorrectionDto
  ): void {
    if (!correction || !correction.suggestion) return;

    console.log(`[LintPlugin] Applying correction: ${correction.suggestion}`);
    console.log(`[LintPlugin] Original text: "${correction.text || ''}"`);

    let from = correction.from;
    let to = correction.to;

    // Need to add back the +1 adjustment that was made during decoration creation
    // but removed when storing in the ExtendedCorrectionDto
    from = from + 1;
    to = to + 1;

    if (
      typeof from !== 'number' ||
      typeof to !== 'number' ||
      from < 0 ||
      to <= 0 ||
      from === to
    ) {
      console.warn('[LintPlugin] Invalid correction range:', correction);
      return;
    }

    // Validate positions against document size
    const docSize = view.state.doc.content.size;
    if (from < 0) from = 0;
    if (to > docSize) to = docSize;

    // Double-check the text at this position to ensure we're replacing the right thing
    const actualText = view.state.doc.textBetween(from, to);
    console.log(
      `[LintPlugin] Actual text at position ${from}-${to}: "${actualText}"`
    );

    // Check if we need to preserve leading or trailing whitespace
    const originalText = correction.text || '';
    let suggestion = correction.suggestion;

    // Count leading whitespace in original text
    let leadingWhitespace = '';
    for (let i = 0; i < originalText.length; i++) {
      if (/\s/.test(originalText[i])) {
        leadingWhitespace += originalText[i];
      } else {
        break;
      }
    }

    // Count trailing whitespace in original text
    let trailingWhitespace = '';
    for (let i = originalText.length - 1; i >= 0; i--) {
      if (/\s/.test(originalText[i])) {
        trailingWhitespace = originalText[i] + trailingWhitespace;
      } else {
        break;
      }
    }

    // Preserve whitespace in the suggestion
    if (leadingWhitespace && !/^\s/.test(suggestion)) {
      suggestion = leadingWhitespace + suggestion;
    }

    if (trailingWhitespace && !/\s$/.test(suggestion)) {
      suggestion = suggestion + trailingWhitespace;
    }

    console.log(`[LintPlugin] Modified suggestion: "${suggestion}"`);

    // Create a new transaction that replaces the text precisely at the correction bounds
    const tr = view.state.tr.replaceWith(
      from,
      to,
      view.state.schema.text(suggestion)
    );

    // After applying the correction, reset the selection to the end of the inserted text
    const newPos = from + suggestion.length;
    tr.setSelection(TextSelection.create(tr.doc, newPos, newPos));

    view.dispatch(tr);
  }

  // Create decorations from lint results
  function createDecorations(
    doc: Node,
    lintResult: PostLint200Response
  ): { decos: DecorationSet; suggestions: ExtendedCorrectionDto[] } {
    if (
      !lintResult ||
      !Array.isArray(lintResult.corrections) ||
      lintResult.corrections.length === 0
    ) {
      console.log('[LintPlugin] No corrections found in lint result');
      return { decos: DecorationSet.empty, suggestions: [] };
    }

    console.log(
      '[LintPlugin] Creating decorations for corrections:',
      lintResult.corrections
    );

    // Filter out rejected suggestions
    const filteredCorrections = lintResult.corrections.filter(
      (correction: CorrectionDto) =>
        !lintStorage.isSuggestionRejected(correction)
    );

    console.log(
      `[LintPlugin] Filtered ${lintResult.corrections.length - filteredCorrections.length} rejected suggestions`
    );

    const extendedSuggestions: ExtendedCorrectionDto[] = [];
    const decos = filteredCorrections
      .map((correction: CorrectionDto) => {
        let reasonText = '';

        // Handle both formats of corrections (server might send 'error' or 'reason')
        if ('reason' in correction && typeof correction.reason === 'string') {
          reasonText = correction.reason;
        } else if (
          'error' in correction &&
          typeof correction.error === 'string'
        ) {
          reasonText = `Error: ${correction.error}`;
        }

        // Ensure we have from and to properties - adjust for potential off-by-one issues
        // Note: The server might be sending positions that are off by one character
        let from = typeof correction.from === 'number' ? correction.from : 0;
        let to = typeof correction.to === 'number' ? correction.to : 0;

        // Adjust positions to fix off-by-one server issue
        // Skip the leading space by incrementing from by 1
        // Include the last letter by incrementing to by 1
        from = from + 1;
        to = to + 1;

        // Validate and adjust the positions
        try {
          // Ensure positions are within document bounds
          const docSize = doc.content.size;
          if (from < 0) from = 0;
          if (to > docSize) to = docSize;

          // Ensure we have a valid range (from < to)
          if (from >= to) {
            console.warn('[LintPlugin] Invalid range detected, from >= to', {
              from,
              to,
            });
            return null;
          }

          // Get the text in this range to store with the correction
          const text = doc.textBetween(from, to);
          console.log(`[LintPlugin] Text at position ${from}-${to}: "${text}"`);

          // Create an extended correction that includes the text and adjusted positions
          const extendedCorrection: ExtendedCorrectionDto = {
            ...correction,
            from: from - 1, // Store the adjusted positions
            to: to - 1,
            text: text,
            reason: reasonText,
          };

          // Add to the list of active suggestions
          extendedSuggestions.push(extendedCorrection);

          console.log(
            `[LintPlugin] Creating decoration from ${from} to ${to} with suggestion: ${correction.suggestion}`
          );

          // Create decoration with validated positions
          return Decoration.inline(from, to, {
            class: 'lint-error',
            'data-correction': JSON.stringify(extendedCorrection),
          });
        } catch (error) {
          console.error('[LintPlugin] Error creating decoration:', error);
          return null;
        }
      })
      .filter(Boolean) as Decoration[];

    console.log(`[LintPlugin] Created ${decos.length} decorations`);
    return {
      decos: DecorationSet.create(doc, decos),
      suggestions: extendedSuggestions,
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
      apply(tr, prev: LintState, oldState, newState): LintState {
        // Handle decorations metadata
        const meta = tr.getMeta(pluginKey);
        if (meta && typeof meta === 'object') {
          // Check for proper metadata structure with type safety
          interface DecorationMeta {
            type: string;
            res?: PostLint200Response;
            reqId: number;
          }

          const isDecorationMeta = (m: any): m is DecorationMeta => {
            return (
              'type' in m &&
              (m.type === 'decorations' || m.type === 'redecorate') &&
              'reqId' in m &&
              typeof m.reqId === 'number'
            );
          };

          if (isDecorationMeta(meta)) {
            // Only update if the reqId is greater than or equal to current
            // (prevents old async results from overwriting newer ones)
            if (meta.reqId >= prev.reqId) {
              console.log('[LintPlugin] Applying new decorations from meta');

              if (meta.type === 'decorations' && meta.res) {
                const result = createDecorations(newState.doc, meta.res);
                return {
                  decos: result.decos,
                  reqId: meta.reqId,
                  suggestions: result.suggestions,
                };
              } else if (meta.type === 'redecorate') {
                // This is a refresh request after a suggestion was rejected
                // We need to get the latest lint result
                console.log(
                  '[LintPlugin] Refreshing decorations after rejection'
                );
                textUpdates.next(newState.doc);
                return {
                  decos: prev.decos,
                  reqId: meta.reqId,
                  suggestions: prev.suggestions,
                };
              }
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
          suggestions: prev.suggestions,
        };
      },
    },

    props: {
      decorations(state) {
        const pluginState = pluginKey.getState(state);
        if (pluginState?.decos) {
          const allDecos = pluginState.decos.find();
          console.log(
            `[LintPlugin] Returning ${allDecos.length} decorations for rendering`
          );
        }
        return pluginState?.decos;
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

          // Remove event listeners
          document.removeEventListener('lint-accept', () => {});
          document.removeEventListener('lint-reject', () => {});
        },
      };
    },
  });
}

// Helper function used to check if cursor is in a suggestion
export function findSuggestionAtPos(
  pos: number,
  suggestions: ExtendedCorrectionDto[]
): ExtendedCorrectionDto | null {
  for (const suggestion of suggestions) {
    const from = suggestion.from;
    const to = suggestion.to;
    if (from <= pos && pos <= to) {
      return suggestion;
    }
  }
  return null;
}




