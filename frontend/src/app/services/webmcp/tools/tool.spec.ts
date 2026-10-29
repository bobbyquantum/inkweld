import { describe, expect, it, vi } from 'vitest';

import {
  schema,
  toModelContextTool,
  ToolArgs,
  ToolError,
  toolSuccess,
  type WebMcpToolDefinition,
} from './tool';

function definition(
  run: WebMcpToolDefinition['run'],
  extra: Partial<WebMcpToolDefinition> = {}
): WebMcpToolDefinition {
  return {
    name: 'demo',
    title: 'Demo',
    description: 'A demo tool',
    inputSchema: schema(),
    run,
    ...extra,
  };
}

describe('toModelContextTool', () => {
  it('returns data as text and structured content', async () => {
    const tool = toModelContextTool(definition(() => ({ count: 2 })));

    const result = await tool.execute({});

    expect(result).toEqual({
      content: [{ type: 'text', text: '{"count":2}' }],
      structuredContent: { count: 2 },
    });
  });

  it('returns an error result instead of rejecting', async () => {
    const tool = toModelContextTool(
      definition(() => {
        throw new ToolError('No project is open.');
      })
    );

    const result = await tool.execute({});

    expect(result).toEqual({
      content: [{ type: 'text', text: 'No project is open.' }],
      isError: true,
    });
  });

  it('reports unexpected errors with their message', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tool = toModelContextTool(
      definition(() => Promise.reject(new Error('IndexedDB is closed')))
    );

    const result = (await tool.execute({})) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('maps the definition flags to annotations', () => {
    const tool = toModelContextTool(
      definition(() => null, {
        readOnly: true,
        untrustedContent: true,
        consequential: true,
      })
    );

    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
      consequentialHint: true,
    });
  });

  it('passes the execution signal to run', async () => {
    const run = vi.fn(() => 'done');
    const controller = new AbortController();
    const tool = toModelContextTool(definition(run));

    await tool.execute({ a: 1 }, { signal: controller.signal });

    expect(run).toHaveBeenCalledWith(expect.any(ToolArgs), controller.signal);
  });
});

describe('toolSuccess', () => {
  it('returns strings as plain text', () => {
    expect(toolSuccess('hello')).toEqual({
      content: [{ type: 'text', text: 'hello' }],
    });
  });

  it('reports ok for an empty result', () => {
    expect(toolSuccess(undefined).structuredContent).toEqual({ ok: true });
  });
});

describe('ToolArgs', () => {
  const args = new ToolArgs({
    name: 'Elena',
    blank: '  ',
    count: 3,
    ratio: 1.5,
    on: true,
    tags: ['a', 'b'],
    mixed: ['a', 1],
    fields: { age: 3 },
    parent: null,
  });

  it('reads required and optional strings', () => {
    expect(args.string('name')).toBe('Elena');
    expect(args.optionalString('missing')).toBeUndefined();
    expect(() => args.string('blank')).toThrow('"blank" is required.');
    expect(() => args.string('count')).toThrow('must be a string');
  });

  it('distinguishes null from missing for nullable strings', () => {
    expect(args.nullableString('parent')).toBeNull();
    expect(args.nullableString('missing')).toBeUndefined();
  });

  it('reads booleans', () => {
    expect(args.optionalBoolean('on')).toBe(true);
    expect(() => args.optionalBoolean('name')).toThrow('true or false');
  });

  it('reads whole numbers within a range', () => {
    expect(args.optionalInteger('count', { min: 0, max: 5 })).toBe(3);
    expect(() => args.optionalInteger('ratio')).toThrow('whole number');
    expect(() => args.optionalInteger('count', { min: 4 })).toThrow(
      'at least 4'
    );
    expect(() => args.optionalInteger('count', { max: 2 })).toThrow(
      'at most 2'
    );
  });

  it('checks enumerations', () => {
    expect(args.oneOf('name', ['Elena', 'Marcus'])).toBe('Elena');
    expect(() => args.oneOf('name', ['Marcus'])).toThrow('must be one of');
    expect(() => args.oneOf('missing', ['a'])).toThrow('is required');
  });

  it('reads string arrays and objects', () => {
    expect(args.stringArray('tags')).toEqual(['a', 'b']);
    expect(args.stringArray('missing')).toEqual([]);
    expect(() => args.stringArray('mixed')).toThrow('array of strings');
    expect(args.record('fields')).toEqual({ age: 3 });
    expect(() => args.record('tags')).toThrow('must be an object');
  });

  it('treats a non-object input as empty', () => {
    const empty = new ToolArgs('not an object');
    expect(empty.has('name')).toBe(false);
  });

  it('hands out raw values unchecked', () => {
    expect(args.raw('mixed')).toEqual(['a', 1]);
    expect(args.raw('parent')).toBeNull();
    expect(args.raw('missing')).toBeUndefined();
  });
});

describe('schema', () => {
  it('omits required when nothing is required', () => {
    expect(schema({ a: { type: 'string' } })).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
    });
    expect(schema({}, ['a']).required).toEqual(['a']);
  });
});
