import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GREGORIAN_SYSTEM,
  TIME_SYSTEM_TEMPLATES,
  type TimeSystem,
} from '../../models/time-system';
import { LoggerService } from '../core/logger.service';
import { type IElementSyncProvider } from '../sync/element-sync-provider.interface';
import { TimeSystemLibraryService } from './time-system-library.service';

function makeSystem(overrides: Partial<TimeSystem> = {}): TimeSystem {
  return {
    ...GREGORIAN_SYSTEM,
    id: 'test-system',
    name: 'Test System',
    isBuiltIn: false,
    ...overrides,
  };
}

function makeSyncProvider(
  initial: TimeSystem[] = []
): IElementSyncProvider & { subject: Subject<TimeSystem[]> } {
  const subject = new Subject<TimeSystem[]>();
  const provider = {
    subject,
    getTimeSystems: vi.fn(() => initial),
    timeSystems$: subject.asObservable(),
    updateTimeSystems: vi.fn(),
    // unused methods — stub out
    getElements: vi.fn(),
    elements$: new Subject<never>().asObservable(),
    updateElement: vi.fn(),
  } as unknown as IElementSyncProvider & { subject: Subject<TimeSystem[]> };
  return provider;
}

describe('TimeSystemLibraryService', () => {
  let service: TimeSystemLibraryService;

  const mockLogger = {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TimeSystemLibraryService,
        { provide: LoggerService, useValue: mockLogger },
      ],
    });
    service = TestBed.inject(TimeSystemLibraryService);
    vi.clearAllMocks();
  });

  it('starts with no systems when no provider is set', () => {
    expect(service.systems()).toEqual([]);
  });

  it('exposes built-in templates', () => {
    expect(service.templates.length).toBeGreaterThan(0);
  });

  describe('setSyncProvider', () => {
    it('loads initial systems from provider', () => {
      const sys = makeSystem();
      const provider = makeSyncProvider([sys]);
      service.setSyncProvider(provider);
      expect(service.systems()).toEqual([sys]);
    });

    it('reacts to observable updates from provider', () => {
      const provider = makeSyncProvider([]);
      service.setSyncProvider(provider);
      const sys = makeSystem();
      provider.subject.next([sys]);
      expect(service.systems()).toContainEqual(sys);
    });

    it('clears systems when provider is set to null', () => {
      const provider = makeSyncProvider([makeSystem()]);
      service.setSyncProvider(provider);
      service.setSyncProvider(null);
      expect(service.systems()).toEqual([]);
    });

    it('unsubscribes from old provider when switched', () => {
      const p1 = makeSyncProvider([]);
      const p2 = makeSyncProvider([]);
      service.setSyncProvider(p1);
      service.setSyncProvider(p2);
      // p1 updates should no longer affect service
      p1.subject.next([makeSystem()]);
      expect(service.systems()).toEqual([]);
    });
  });

  describe('findSystem', () => {
    it('finds an installed system by id', () => {
      const provider = makeSyncProvider([makeSystem({ id: 'my-sys' })]);
      service.setSyncProvider(provider);
      expect(service.findSystem('my-sys')).toBeDefined();
    });

    it('returns undefined for unknown id', () => {
      service.setSyncProvider(makeSyncProvider([]));
      expect(service.findSystem('unknown')).toBeUndefined();
    });
  });

  describe('resolveSystem', () => {
    it('returns null for undefined id', () => {
      expect(service.resolveSystem(undefined)).toBeNull();
    });

    it('returns installed system', () => {
      const sys = makeSystem({ id: 'test' });
      service.setSyncProvider(makeSyncProvider([sys]));
      expect(service.resolveSystem('test')).toEqual(sys);
    });

    it('falls back to template for unknown id', () => {
      service.setSyncProvider(makeSyncProvider([]));
      const tplId = TIME_SYSTEM_TEMPLATES[0].id;
      expect(service.resolveSystem(tplId)).toBeDefined();
    });

    it('returns null for completely unknown id', () => {
      service.setSyncProvider(makeSyncProvider([]));
      expect(service.resolveSystem('completely-unknown')).toBeNull();
    });
  });

  describe('installTemplate', () => {
    beforeEach(() => {
      service.setSyncProvider(makeSyncProvider([]));
    });

    it('installs a template by id', () => {
      const tplId = GREGORIAN_SYSTEM.id;
      const result = service.installTemplate(tplId);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(tplId);
      expect(service.systems()).toContainEqual(result);
    });

    it('returns null for unknown template id', () => {
      expect(service.installTemplate('does-not-exist')).toBeNull();
    });

    it('returns the existing system if already installed', () => {
      const tplId = GREGORIAN_SYSTEM.id;
      service.installTemplate(tplId);
      const second = service.installTemplate(tplId);
      expect(service.systems().filter(s => s.id === tplId).length).toBe(1);
      expect(second).not.toBeNull();
    });

    it('sets isBuiltIn to false on installed template', () => {
      const tplId = GREGORIAN_SYSTEM.id;
      const result = service.installTemplate(tplId);
      expect(result!.isBuiltIn).toBe(false);
    });

    it('logs warning and does not crash without a sync provider', () => {
      service.setSyncProvider(null);
      // Call installTemplate — should not crash, logs warning
      const result = service.installTemplate(GREGORIAN_SYSTEM.id);
      expect(mockLogger.warn).toHaveBeenCalled();
      // Still updates the in-memory signal
      expect(result).not.toBeNull();
    });
  });

  describe('addCustomSystem', () => {
    beforeEach(() => {
      service.setSyncProvider(makeSyncProvider([]));
    });

    it('adds a custom system with generated id', () => {
      const { id: _id, isBuiltIn: _b, ...input } = GREGORIAN_SYSTEM;
      const result = service.addCustomSystem({ ...input, name: 'My Custom' });
      expect(result.id).toBeTruthy();
      expect(result.name).toBe('My Custom');
      expect(result.isBuiltIn).toBe(false);
      expect(service.systems()).toContainEqual(result);
    });
  });

  describe('updateSystem', () => {
    it('updates an existing system', () => {
      const sys = makeSystem({ id: 'upd', name: 'Before' });
      service.setSyncProvider(makeSyncProvider([sys]));
      service.updateSystem('upd', { name: 'After' });
      expect(service.findSystem('upd')?.name).toBe('After');
    });

    it('does nothing for unknown id', () => {
      service.setSyncProvider(makeSyncProvider([]));
      service.updateSystem('ghost', { name: 'Ghost' });
      expect(service.systems()).toEqual([]);
    });
  });

  describe('removeSystem', () => {
    it('removes a system by id', () => {
      const sys = makeSystem({ id: 'del' });
      service.setSyncProvider(makeSyncProvider([sys]));
      service.removeSystem('del');
      expect(service.findSystem('del')).toBeUndefined();
    });

    it('ignores removal of unknown id', () => {
      const sys = makeSystem({ id: 'keep' });
      service.setSyncProvider(makeSyncProvider([sys]));
      service.removeSystem('unknown');
      expect(service.systems().length).toBe(1);
    });
  });
});
