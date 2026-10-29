import type {
  ModelContextTool,
  ModelContextToolAnnotations,
} from '../model-context';

/** JSON Schema for a tool's input object. */
export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, object>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * One WebMCP tool. `run` returns a JSON-serialisable value, or throws a
 * {@link ToolError} for a problem the agent should see and correct.
 */
export interface WebMcpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: ToolInputSchema;
  /** Only reads; never changes anything. */
  readOnly?: boolean;
  /**
   * Changes the open project. Registered only while the user can edit it,
   * and refused at run time otherwise.
   */
  writes?: boolean;
  /** Deletes or overwrites user work; the agent should confirm first. */
  consequential?: boolean;
  /** The result carries user-written content (documents, notes, names). */
  untrustedContent?: boolean;
  run(args: ToolArgs, signal: AbortSignal): unknown;
}

/** An error whose message is meant for the agent. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/**
 * The result shape returned to the agent. The spec accepts any
 * JSON-serialisable value; using MCP's `CallToolResult` keeps the result
 * readable both for spec agents (which stringify it) and for MCP bridges such
 * as the MCP-B extension (which forward it as-is).
 */
export interface ToolResult {
  content: { type: 'text'; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

export function toolSuccess(data: unknown): ToolResult {
  const value = data ?? { ok: true };
  if (typeof value === 'string') {
    return { content: [{ type: 'text', text: value }] };
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

export function toolFailure(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' ? error : 'Unknown error';
}

/**
 * Wrap a definition as a `ModelContextTool`. A thrown error becomes an
 * `isError` result instead of a rejected promise: the browser reports a
 * rejection to the agent only as "tool rejected", without the message.
 */
export function toModelContextTool(
  definition: WebMcpToolDefinition
): ModelContextTool {
  const annotations: ModelContextToolAnnotations = {
    readOnlyHint: definition.readOnly ?? false,
  };
  if (definition.untrustedContent) annotations.untrustedContentHint = true;
  if (definition.consequential) annotations.consequentialHint = true;
  return {
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: definition.inputSchema,
    annotations,
    execute: async (input, options) => {
      const signal = options?.signal ?? new AbortController().signal;
      try {
        const args = new ToolArgs(input);
        return toolSuccess(await definition.run(args, signal));
      } catch (error) {
        if (!(error instanceof ToolError)) {
          console.warn(`[WebMCP] ${definition.name} failed`, error);
        }
        return toolFailure(errorMessage(error));
      }
    },
  };
}

/**
 * Typed access to a tool's input. Agents do not always respect the schema,
 * so every getter validates and throws a {@link ToolError} naming the field.
 */
export class ToolArgs {
  private readonly input: Record<string, unknown>;

  constructor(input: unknown) {
    this.input =
      typeof input === 'object' && input !== null && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
  }

  has(name: string): boolean {
    return this.input[name] !== undefined && this.input[name] !== null;
  }

  /** The value as given, for an argument that needs its own checks. */
  raw(name: string): unknown {
    return this.input[name];
  }

  string(name: string): string {
    const value = this.optionalString(name);
    if (value === undefined || value.trim() === '') {
      throw new ToolError(`"${name}" is required.`);
    }
    return value;
  }

  optionalString(name: string): string | undefined {
    const value = this.input[name];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') {
      throw new ToolError(`"${name}" must be a string.`);
    }
    return value;
  }

  /** A string that may be null (meaning "clear" or "root"). */
  nullableString(name: string): string | null | undefined {
    if (this.input[name] === null) return null;
    return this.optionalString(name);
  }

  optionalBoolean(name: string): boolean | undefined {
    const value = this.input[name];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'boolean') {
      throw new ToolError(`"${name}" must be true or false.`);
    }
    return value;
  }

  optionalInteger(
    name: string,
    range: { min?: number; max?: number } = {}
  ): number | undefined {
    const value = this.input[name];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new ToolError(`"${name}" must be a whole number.`);
    }
    if (range.min !== undefined && value < range.min) {
      throw new ToolError(`"${name}" must be at least ${range.min}.`);
    }
    if (range.max !== undefined && value > range.max) {
      throw new ToolError(`"${name}" must be at most ${range.max}.`);
    }
    return value;
  }

  oneOf<T extends string>(name: string, allowed: readonly T[]): T {
    const value = this.optionalOneOf(name, allowed);
    if (value === undefined) {
      throw new ToolError(`"${name}" is required (${allowed.join(', ')}).`);
    }
    return value;
  }

  optionalOneOf<T extends string>(
    name: string,
    allowed: readonly T[]
  ): T | undefined {
    const value = this.optionalString(name);
    if (value === undefined) return undefined;
    if (!(allowed as readonly string[]).includes(value)) {
      throw new ToolError(
        `"${name}" must be one of: ${allowed.join(', ')} (got "${value}").`
      );
    }
    return value as T;
  }

  stringArray(name: string): string[] {
    const value = this.input[name];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) {
      throw new ToolError(`"${name}" must be an array of strings.`);
    }
    return value as string[];
  }

  record(name: string): Record<string, unknown> | undefined {
    const value = this.input[name];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new ToolError(`"${name}" must be an object.`);
    }
    return value as Record<string, unknown>;
  }
}

/** Shorthand for an object schema with no required fields. */
export function schema(
  properties: Record<string, object> = {},
  required: string[] = []
): ToolInputSchema {
  return required.length > 0
    ? { type: 'object', properties, required }
    : { type: 'object', properties };
}
