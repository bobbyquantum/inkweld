import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SettingsService } from '@services/core/settings.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModelContextLike } from './model-context';
import {
  WEBMCP_REGISTRY_LOADER,
  type WebMcpRegistryHandle,
  WebMcpService,
} from './webmcp.service';

describe('WebMcpService', () => {
  const enabled = signal(false);
  let registries: (WebMcpRegistryHandle & { context: ModelContextLike })[];
  let loader: ReturnType<typeof vi.fn>;

  class FakeRegistry {
    readonly start = vi.fn();
    readonly dispose = vi.fn();
    constructor(
      _injector: unknown,
      readonly context: ModelContextLike
    ) {
      registries.push(this);
    }
  }

  function setModelContext(value: unknown): void {
    Object.defineProperty(document, 'modelContext', {
      value,
      configurable: true,
      writable: true,
    });
  }

  function create(): WebMcpService {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SettingsService, useValue: { aiAllowed: enabled } },
        { provide: WEBMCP_REGISTRY_LOADER, useValue: loader },
      ],
    });
    const service = TestBed.inject(WebMcpService);
    service.start();
    return service;
  }

  /** Run effects, then let the lazy load resolve. */
  async function settle(): Promise<void> {
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  beforeEach(() => {
    enabled.set(false);
    registries = [];
    loader = vi.fn(() => Promise.resolve(FakeRegistry));
  });

  afterEach(() => {
    delete (document as { modelContext?: unknown }).modelContext;
    TestBed.resetTestingModule();
  });

  it('registers nothing while the preference is off', async () => {
    setModelContext({ registerTool: vi.fn() });
    const service = create();
    await settle();

    expect(service.supported()).toBe(true);
    expect(loader).not.toHaveBeenCalled();
    expect(service.active()).toBe(false);
  });

  it('loads and starts the tools when turned on', async () => {
    const context = { registerTool: vi.fn() };
    setModelContext(context);
    const service = create();

    enabled.set(true);
    await settle();

    expect(registries).toHaveLength(1);
    expect(registries[0].context).toBe(context);
    expect(registries[0].start).toHaveBeenCalled();
    expect(service.active()).toBe(true);
  });

  it('removes the tools when turned off again', async () => {
    setModelContext({ registerTool: vi.fn() });
    const service = create();
    enabled.set(true);
    await settle();

    enabled.set(false);
    await settle();

    expect(registries[0].dispose).toHaveBeenCalled();
    expect(service.active()).toBe(false);
  });

  it('does nothing in a browser without WebMCP', async () => {
    const service = create();
    enabled.set(true);
    await settle();

    expect(service.supported()).toBe(false);
    expect(loader).not.toHaveBeenCalled();
  });

  it('does not start a registry that finished loading after being turned off', async () => {
    setModelContext({ registerTool: vi.fn() });
    let resolve!: (value: typeof FakeRegistry) => void;
    loader.mockReturnValue(
      new Promise<typeof FakeRegistry>(r => {
        resolve = r;
      })
    );
    const service = create();
    enabled.set(true);
    TestBed.tick();

    enabled.set(false);
    TestBed.tick();
    resolve(FakeRegistry);
    await settle();

    expect(registries).toHaveLength(0);
    expect(service.active()).toBe(false);
  });

  it('keeps working when the tools fail to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setModelContext({ registerTool: vi.fn() });
    loader.mockRejectedValue(new Error('chunk failed'));
    const service = create();

    enabled.set(true);
    await settle();

    expect(service.active()).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('picks up a WebMCP API that appears after startup', async () => {
    vi.useFakeTimers();
    try {
      const service = create();
      enabled.set(true);
      await settle();
      expect(service.supported()).toBe(false);

      // e.g. an extension or an origin-trial token adds it a moment later
      setModelContext({ registerTool: vi.fn() });
      await vi.advanceTimersByTimeAsync(1000);
      await settle();

      expect(service.supported()).toBe(true);
      expect(registries).toHaveLength(1);
      expect(service.active()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-checks on demand', () => {
    const service = create();
    expect(service.refreshSupport()).toBe(false);
    setModelContext({ registerTool: vi.fn() });
    expect(service.refreshSupport()).toBe(true);
    expect(service.supported()).toBe(true);
  });

  it('starts only once', async () => {
    setModelContext({ registerTool: vi.fn() });
    const service = create();
    service.start();
    enabled.set(true);
    await settle();

    expect(registries).toHaveLength(1);
  });
});
