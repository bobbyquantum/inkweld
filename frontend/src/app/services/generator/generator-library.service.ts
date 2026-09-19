import { computed, inject, Injectable, signal } from '@angular/core';
import { cloneGenerator, type Generator } from '@models/generator';
import { LoggerService } from '@services/core/logger.service';
import { type IElementSyncProvider } from '@services/sync/element-sync-provider.interface';
import {
  rollGenerator,
  type RollOptions,
  type RollResult,
} from '@utils/generator-engine';
import { nanoid } from 'nanoid';
import { type Subscription } from 'rxjs';

/**
 * Per-project library of random generators (names, places, prompts).
 *
 * Generators are persisted in the same Yjs document as worldbuilding
 * schemas, tags and time systems — so they sync between collaborators
 * online and fall back to IndexedDB offline, with no extra plumbing.
 *
 * Component-facing API is signal-based for easy `computed()` composition.
 */
@Injectable({ providedIn: 'root' })
export class GeneratorLibraryService {
  private readonly logger = inject(LoggerService);

  private syncProvider: IElementSyncProvider | null = null;
  private subscription: Subscription | null = null;

  private readonly generatorsSignal = signal<Generator[]>([]);

  /** Generators defined in the active project. */
  readonly generators = this.generatorsSignal.asReadonly();

  /** True when the project has at least one generator to roll. */
  readonly hasGenerators = computed(() => this.generatorsSignal().length > 0);

  /**
   * Set the sync provider for generator-library access.
   * Called by ProjectStateService when a project is loaded/unloaded.
   */
  setSyncProvider(provider: IElementSyncProvider | null): void {
    this.subscription?.unsubscribe();
    this.subscription = null;

    this.syncProvider = provider;
    if (provider) {
      this.generatorsSignal.set(provider.getGenerators());
      this.subscription = provider.generators$.subscribe(generators => {
        this.generatorsSignal.set(generators);
      });
    } else {
      this.generatorsSignal.set([]);
    }
  }

  /** The generator with this id, or undefined. */
  findGenerator(id: string | undefined): Generator | undefined {
    if (!id) return undefined;
    return this.generatorsSignal().find(generator => generator.id === id);
  }

  /** Adds a generator, assigning it an id. Returns the stored copy. */
  addGenerator(input: Omit<Generator, 'id'>): Generator {
    const now = new Date().toISOString();
    const generator = cloneGenerator({
      ...input,
      id: nanoid(),
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    });
    this.write([...this.generatorsSignal(), generator]);
    return generator;
  }

  /** Updates an existing generator. Unknown ids are ignored. */
  updateGenerator(
    id: string,
    updates: Partial<Omit<Generator, 'id' | 'createdAt'>>
  ): void {
    const current = this.generatorsSignal();
    if (!current.some(generator => generator.id === id)) return;

    const now = new Date().toISOString();
    this.write(
      current.map(generator =>
        generator.id === id
          ? cloneGenerator({
              ...generator,
              ...updates,
              id,
              createdAt: generator.createdAt,
              updatedAt: now,
            })
          : generator
      )
    );
  }

  /** Removes a generator from the project. */
  removeGenerator(id: string): void {
    this.write(
      this.generatorsSignal().filter(generator => generator.id !== id)
    );
  }

  /**
   * Rolls the generator with this id. Returns an empty array when the id does
   * not resolve — a schema can outlive the generator it was bound to.
   */
  roll(id: string | undefined, options: RollOptions = {}): RollResult[] {
    const generator = this.findGenerator(id);
    return generator ? rollGenerator(generator, options) : [];
  }

  /**
   * Rolls once and returns just the text, or null when the generator is
   * missing or produced nothing usable.
   */
  rollOne(id: string | undefined, options: RollOptions = {}): string | null {
    const [result] = this.roll(id, { ...options, count: 1 });
    const text = result?.text.trim();
    return text || null;
  }

  /**
   * Persist the full generators array through the sync provider. Writes are
   * optimistic: the signal updates immediately and the sync provider
   * propagates the change to collaborators (online) or IndexedDB (local).
   */
  private write(generators: Generator[]): void {
    this.generatorsSignal.set(generators);
    if (!this.syncProvider) {
      this.logger.warn(
        'GeneratorLibrary',
        'No sync provider - generator write ignored'
      );
      return;
    }
    this.syncProvider.updateGenerators(generators);
  }
}
