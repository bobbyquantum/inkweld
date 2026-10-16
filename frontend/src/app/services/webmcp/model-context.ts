/**
 * Minimal typings and feature detection for the WebMCP browser API
 * (https://webmachinelearning.github.io/webmcp/).
 *
 * The current draft exposes `document.modelContext`, registers one tool at a
 * time with `registerTool(tool, { signal })` and unregisters it when the
 * signal aborts. Chrome's early preview exposed the same object on
 * `navigator.modelContext` with a synchronous `registerTool(tool)` and an
 * explicit `unregisterTool(name)`. Both shapes are supported here so the
 * rest of the app only deals with {@link registerModelContextTool}.
 */

/** Hints an agent uses to decide how carefully to call a tool. */
export interface ModelContextToolAnnotations {
  /** The tool only reads data. */
  readOnlyHint?: boolean;
  /** The result contains content the page does not vouch for (user text). */
  untrustedContentHint?: boolean;
  /** The tool makes a significant or hard-to-undo change. */
  consequentialHint?: boolean;
}

/** A tool definition as passed to `modelContext.registerTool()`. */
export interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  annotations?: ModelContextToolAnnotations;
  execute: (
    input: Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ) => Promise<unknown>;
}

/** The subset of the `ModelContext` interface Inkweld uses. */
export interface ModelContextLike {
  registerTool(
    tool: ModelContextTool,
    options?: { signal?: AbortSignal }
  ): Promise<void> | void;
  /** Early-preview API: removed from the spec in favour of the signal. */
  unregisterTool?(name: string): void;
}

function isModelContext(value: unknown): value is ModelContextLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ModelContextLike).registerTool === 'function'
  );
}

/**
 * The page's `ModelContext`, or null when the browser has no WebMCP support
 * (or the page is not a secure context).
 */
export function getModelContext(): ModelContextLike | null {
  if (typeof document !== 'undefined') {
    const fromDocument = (document as { modelContext?: unknown }).modelContext;
    if (isModelContext(fromDocument)) return fromDocument;
  }
  if (typeof navigator !== 'undefined') {
    const fromNavigator = (navigator as { modelContext?: unknown })
      .modelContext;
    if (isModelContext(fromNavigator)) return fromNavigator;
  }
  return null;
}

/**
 * Register `tool` until `signal` aborts. Resolves once the browser accepted
 * it; rejects when it refused (duplicate name, invalid schema).
 */
export async function registerModelContextTool(
  context: ModelContextLike,
  tool: ModelContextTool,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) return;
  await context.registerTool(tool, { signal });
  if (typeof context.unregisterTool === 'function') {
    const unregister = context.unregisterTool.bind(context);
    // Spec implementations unregister on abort themselves; the early preview
    // ignores the signal and needs the explicit call. A second removal of
    // an already removed tool is harmless in both.
    signal.addEventListener(
      'abort',
      () => {
        try {
          unregister(tool.name);
        } catch {
          // Already gone.
        }
      },
      { once: true }
    );
  }
}
