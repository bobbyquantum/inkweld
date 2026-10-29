import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getModelContext,
  type ModelContextTool,
  registerModelContextTool,
} from './model-context';

const tool: ModelContextTool = {
  name: 'demo',
  description: 'A demo tool',
  execute: () => Promise.resolve('ok'),
};

function setOn(target: object, value: unknown): void {
  Object.defineProperty(target, 'modelContext', {
    value,
    configurable: true,
    writable: true,
  });
}

function clear(target: object): void {
  delete (target as { modelContext?: unknown }).modelContext;
}

describe('getModelContext', () => {
  afterEach(() => {
    clear(document);
    clear(navigator);
  });

  it('is null when the browser has no WebMCP', () => {
    expect(getModelContext()).toBeNull();
  });

  it('finds the spec API on document', () => {
    const context = { registerTool: vi.fn() };
    setOn(document, context);
    expect(getModelContext()).toBe(context);
  });

  it("falls back to Chrome's early preview on navigator", () => {
    const context = { registerTool: vi.fn(), unregisterTool: vi.fn() };
    setOn(navigator, context);
    expect(getModelContext()).toBe(context);
  });

  it('prefers document over navigator', () => {
    const fromDocument = { registerTool: vi.fn() };
    setOn(document, fromDocument);
    setOn(navigator, { registerTool: vi.fn() });
    expect(getModelContext()).toBe(fromDocument);
  });

  it('ignores an object without registerTool', () => {
    setOn(document, { provideContext: vi.fn() });
    expect(getModelContext()).toBeNull();
  });
});

describe('registerModelContextTool', () => {
  it('passes the signal to the spec API', async () => {
    const registerTool = vi.fn().mockResolvedValue(undefined);
    const controller = new AbortController();

    await registerModelContextTool({ registerTool }, tool, controller.signal);

    expect(registerTool).toHaveBeenCalledWith(tool, {
      signal: controller.signal,
    });
  });

  it('calls unregisterTool on abort for the early preview API', async () => {
    const context = { registerTool: vi.fn(), unregisterTool: vi.fn() };
    const controller = new AbortController();

    await registerModelContextTool(context, tool, controller.signal);
    expect(context.unregisterTool).not.toHaveBeenCalled();

    controller.abort();
    expect(context.unregisterTool).toHaveBeenCalledWith('demo');
  });

  it('tolerates unregistering a tool that is already gone', async () => {
    const context = {
      registerTool: vi.fn(),
      unregisterTool: vi.fn(() => {
        throw new Error('not registered');
      }),
    };
    const controller = new AbortController();
    await registerModelContextTool(context, tool, controller.signal);

    expect(() => controller.abort()).not.toThrow();
  });

  it('does not register once the signal has aborted', async () => {
    const registerTool = vi.fn();
    const controller = new AbortController();
    controller.abort();

    await registerModelContextTool({ registerTool }, tool, controller.signal);

    expect(registerTool).not.toHaveBeenCalled();
  });

  it('rejects when the browser refuses the tool', async () => {
    const registerTool = vi.fn(() => {
      throw new Error('duplicate');
    });

    await expect(
      registerModelContextTool(
        { registerTool },
        tool,
        new AbortController().signal
      )
    ).rejects.toThrow('duplicate');
  });
});
