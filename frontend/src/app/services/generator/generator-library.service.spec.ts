import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type Generator } from '../../models/generator';
import { LoggerService } from '../core/logger.service';
import { type IElementSyncProvider } from '../sync/element-sync-provider.interface';
import { GeneratorLibraryService } from './generator-library.service';

function makeGenerator(overrides: Partial<Generator> = {}): Generator {
  return {
    id: 'gen-1',
    name: 'Character names',
    icon: 'casino',
    description: '',
    category: 'names',
    template: '#first#',
    rules: [{ key: 'first', entries: [{ text: 'Aldric' }] }],
    ...overrides,
  };
}

function makeSyncProvider(
  initial: Generator[] = []
): IElementSyncProvider & { subject: Subject<Generator[]> } {
  const subject = new Subject<Generator[]>();
  return {
    subject,
    getGenerators: vi.fn(() => initial),
    generators$: subject.asObservable(),
    updateGenerators: vi.fn(),
  } as unknown as IElementSyncProvider & { subject: Subject<Generator[]> };
}

describe('GeneratorLibraryService', () => {
  let service: GeneratorLibraryService;

  const mockLogger = {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        GeneratorLibraryService,
        { provide: LoggerService, useValue: mockLogger },
      ],
    });
    service = TestBed.inject(GeneratorLibraryService);
  });

  describe('setSyncProvider', () => {
    it('seeds from the provider', () => {
      const existing = makeGenerator();
      service.setSyncProvider(makeSyncProvider([existing]));
      expect(service.generators()).toEqual([existing]);
      expect(service.hasGenerators()).toBe(true);
    });

    it('follows provider emissions', () => {
      const provider = makeSyncProvider();
      service.setSyncProvider(provider);
      const incoming = [makeGenerator({ id: 'remote' })];
      provider.subject.next(incoming);
      expect(service.generators()).toEqual(incoming);
    });

    it('clears and unsubscribes when the provider goes away', () => {
      const provider = makeSyncProvider([makeGenerator()]);
      service.setSyncProvider(provider);
      service.setSyncProvider(null);

      expect(service.generators()).toEqual([]);
      expect(service.hasGenerators()).toBe(false);

      provider.subject.next([makeGenerator({ id: 'late' })]);
      expect(service.generators()).toEqual([]);
    });
  });

  describe('addGenerator', () => {
    it('assigns an id and writes through the provider', () => {
      const provider = makeSyncProvider();
      service.setSyncProvider(provider);

      const created = service.addGenerator({
        name: 'Places',
        icon: 'casino',
        description: '',
        category: 'places',
        template: '#town#',
        rules: [],
      });

      expect(created.id).toBeTruthy();
      expect(created.updatedAt).toBeTruthy();
      expect(service.generators()).toEqual([created]);
      expect(provider.updateGenerators).toHaveBeenCalledWith([created]);
    });

    it('does not share rule objects with the caller', () => {
      service.setSyncProvider(makeSyncProvider());
      const rules = [{ key: 'first', entries: [{ text: 'Aldric' }] }];
      service.addGenerator({
        name: 'Names',
        icon: 'casino',
        description: '',
        category: 'names',
        template: '#first#',
        rules,
      });

      rules[0].entries[0].text = 'mutated';
      expect(service.generators()[0].rules[0].entries[0].text).toBe('Aldric');
    });

    it('warns and keeps local state when there is no provider', () => {
      const created = service.addGenerator({
        name: 'Names',
        icon: 'casino',
        description: '',
        category: 'names',
        template: '#first#',
        rules: [],
      });

      expect(service.generators()).toEqual([created]);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('updateGenerator', () => {
    it('merges updates and refreshes the timestamp', () => {
      const provider = makeSyncProvider([
        makeGenerator({ createdAt: '2020-01-01T00:00:00.000Z' }),
      ]);
      service.setSyncProvider(provider);

      service.updateGenerator('gen-1', { name: 'Renamed' });

      const [updated] = service.generators();
      expect(updated.name).toBe('Renamed');
      expect(updated.template).toBe('#first#');
      expect(updated.createdAt).toBe('2020-01-01T00:00:00.000Z');
      expect(updated.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
    });

    it('ignores unknown ids', () => {
      const provider = makeSyncProvider([makeGenerator()]);
      service.setSyncProvider(provider);

      service.updateGenerator('nope', { name: 'Renamed' });

      expect(service.generators()[0].name).toBe('Character names');
      expect(provider.updateGenerators).not.toHaveBeenCalled();
    });
  });

  describe('removeGenerator', () => {
    it('drops the generator and writes through', () => {
      const provider = makeSyncProvider([
        makeGenerator(),
        makeGenerator({ id: 'gen-2' }),
      ]);
      service.setSyncProvider(provider);

      service.removeGenerator('gen-1');

      expect(service.generators().map(g => g.id)).toEqual(['gen-2']);
      expect(provider.updateGenerators).toHaveBeenCalled();
    });
  });

  describe('findGenerator', () => {
    it('resolves a known id and returns undefined otherwise', () => {
      service.setSyncProvider(makeSyncProvider([makeGenerator()]));
      expect(service.findGenerator('gen-1')?.name).toBe('Character names');
      expect(service.findGenerator('nope')).toBeUndefined();
      expect(service.findGenerator(undefined)).toBeUndefined();
    });
  });

  describe('roll', () => {
    beforeEach(() => {
      service.setSyncProvider(makeSyncProvider([makeGenerator()]));
    });

    it('rolls the requested generator', () => {
      expect(service.roll('gen-1', { seed: 1, count: 3 })).toHaveLength(3);
      expect(service.rollOne('gen-1', { seed: 1 })).toBe('Aldric');
    });

    it('returns nothing for a generator that no longer exists', () => {
      expect(service.roll('deleted')).toEqual([]);
      expect(service.rollOne('deleted')).toBeNull();
      expect(service.rollOne(undefined)).toBeNull();
    });

    it('returns null from rollOne when the roll is blank', () => {
      service.setSyncProvider(
        makeSyncProvider([makeGenerator({ template: '   ' })])
      );
      expect(service.rollOne('gen-1')).toBeNull();
    });
  });
});
