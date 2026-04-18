import { inject, Injectable, signal } from '@angular/core';
import {
  assertValidTimeSystem,
  findTemplateSystem,
  TIME_SYSTEM_TEMPLATES,
  type TimeSystem,
} from '@models/time-system';
import { LoggerService } from '@services/core/logger.service';
import { type IElementSyncProvider } from '@services/sync/element-sync-provider.interface';
import { nanoid } from 'nanoid';
import { type Subscription } from 'rxjs';

/**
 * Per-project library of time systems (calendars).
 *
 * Time systems are persisted in the same Yjs document as worldbuilding
 * schemas, relationships, etc. — this gives us automatic real-time sync
 * between collaborators (online mode) and IndexedDB-backed offline
 * support (local mode).
 *
 * Component-facing API is signal-based for easy `computed()` composition.
 */
@Injectable({ providedIn: 'root' })
export class TimeSystemLibraryService {
  private readonly logger = inject(LoggerService);

  private syncProvider: IElementSyncProvider | null = null;
  private subscription: Subscription | null = null;

  /** Current installed systems for the active project. */
  private readonly systemsSignal = signal<TimeSystem[]>([]);
  readonly systems = this.systemsSignal.asReadonly();

  /** Available templates the user can install (in-memory, not persisted). */
  readonly templates: readonly TimeSystem[] = TIME_SYSTEM_TEMPLATES;

  /**
   * Set the sync provider for time-system library access.
   * Called by ProjectStateService when a project is loaded/unloaded.
   */
  setSyncProvider(provider: IElementSyncProvider | null): void {
    this.subscription?.unsubscribe();
    this.subscription = null;

    this.syncProvider = provider;
    if (provider) {
      this.systemsSignal.set(provider.getTimeSystems());
      this.subscription = provider.timeSystems$.subscribe(systems => {
        this.systemsSignal.set(systems);
      });
    } else {
      this.systemsSignal.set([]);
    }
  }

  /** Returns the currently-installed system matching `id`, or undefined. */
  findSystem(id: string): TimeSystem | undefined {
    return this.systemsSignal().find(s => s.id === id);
  }

  /**
   * Returns a system to use for rendering. Falls back to the template
   * registry so orphaned events in timelines still render without throwing.
   */
  resolveSystem(id: string | undefined): TimeSystem | null {
    if (!id) return null;
    return this.findSystem(id) ?? findTemplateSystem(id) ?? null;
  }

  /**
   * Install a template into the project by cloning it. The clone keeps the
   * template id on first install so that the user can reference well-known
   * systems (Gregorian, ISO-year, etc.) by stable id.
   */
  installTemplate(templateId: string): TimeSystem | null {
    const tpl = findTemplateSystem(templateId);
    if (!tpl) return null;
    const existing = this.systemsSignal();
    const duplicate = existing.find(s => s.id === templateId);
    if (duplicate) return duplicate;
    const installed: TimeSystem = {
      ...tpl,
      id: templateId,
      isBuiltIn: false,
      unitLabels: [...tpl.unitLabels],
      subdivisions: [...tpl.subdivisions],
      ...(tpl.unitAliases
        ? { unitAliases: cloneUnitAliases(tpl.unitAliases) }
        : {}),
      ...(tpl.unitAllowZero ? { unitAllowZero: [...tpl.unitAllowZero] } : {}),
      ...(tpl.unitInputMode ? { unitInputMode: [...tpl.unitInputMode] } : {}),
      ...(tpl.unitSubdivisionOverrides
        ? {
            unitSubdivisionOverrides: cloneUnitSubdivisionOverrides(
              tpl.unitSubdivisionOverrides
            ),
          }
        : {}),
    };
    this.write([...existing, installed]);
    return installed;
  }

  /** Add a fully user-defined system (from the designer dialog). */
  addCustomSystem(input: Omit<TimeSystem, 'id' | 'isBuiltIn'>): TimeSystem {
    const system: TimeSystem = {
      ...input,
      id: nanoid(),
      isBuiltIn: false,
      unitLabels: [...input.unitLabels],
      subdivisions: [...input.subdivisions],
      ...(input.unitAliases
        ? { unitAliases: cloneUnitAliases(input.unitAliases) }
        : {}),
      ...(input.unitAllowZero
        ? { unitAllowZero: [...input.unitAllowZero] }
        : {}),
      ...(input.unitInputMode
        ? { unitInputMode: [...input.unitInputMode] }
        : {}),
      ...(input.unitSubdivisionOverrides
        ? {
            unitSubdivisionOverrides: cloneUnitSubdivisionOverrides(
              input.unitSubdivisionOverrides
            ),
          }
        : {}),
    };
    assertValidTimeSystem(system);
    this.write([...this.systemsSignal(), system]);
    return system;
  }

  /** Update mutable fields of an existing system (name, labels, etc.). */
  updateSystem(
    id: string,
    updates: Partial<Omit<TimeSystem, 'id' | 'isBuiltIn'>>
  ): void {
    const current = this.systemsSignal();
    if (!current.some(s => s.id === id)) return;
    const next = current.map(s => {
      if (s.id !== id) return s;
      const mergedUnitAliases = updates.unitAliases ?? s.unitAliases;
      const mergedAllowZero = updates.unitAllowZero ?? s.unitAllowZero;
      const mergedInputMode = updates.unitInputMode ?? s.unitInputMode;
      const mergedSubdivisionOverrides =
        updates.unitSubdivisionOverrides ?? s.unitSubdivisionOverrides;
      const merged: TimeSystem = {
        ...s,
        ...updates,
        id,
        isBuiltIn: s.isBuiltIn,
        unitLabels: updates.unitLabels
          ? [...updates.unitLabels]
          : [...s.unitLabels],
        subdivisions: updates.subdivisions
          ? [...updates.subdivisions]
          : [...s.subdivisions],
        ...(mergedUnitAliases
          ? { unitAliases: cloneUnitAliases(mergedUnitAliases) }
          : {}),
        ...(mergedAllowZero ? { unitAllowZero: [...mergedAllowZero] } : {}),
        ...(mergedInputMode ? { unitInputMode: [...mergedInputMode] } : {}),
        ...(mergedSubdivisionOverrides
          ? {
              unitSubdivisionOverrides: cloneUnitSubdivisionOverrides(
                mergedSubdivisionOverrides
              ),
            }
          : {}),
      };
      assertValidTimeSystem(merged);
      return merged;
    });
    this.write(next);
  }

  /** Remove a system from the project. */
  removeSystem(id: string): void {
    this.write(this.systemsSignal().filter(s => s.id !== id));
  }

  /**
   * Persist the full systems array through the sync provider. Writes are
   * optimistic: the signal is updated immediately and the sync provider
   * propagates changes to all collaborators (online) or IndexedDB (local).
   */
  private write(systems: TimeSystem[]): void {
    this.systemsSignal.set(systems);
    if (!this.syncProvider) {
      this.logger.warn(
        'TimeSystemLibrary',
        'No sync provider - time-system write ignored'
      );
      return;
    }
    this.syncProvider.updateTimeSystems(systems);
  }
}

/**
 * Deep-clone a `unitAliases` array so stored systems do not alias the frozen
 * template objects (templates are `Object.freeze`d; mutating them would
 * throw, and holding references to them across writes would defeat
 * immutability assumptions elsewhere).
 */
function cloneUnitAliases(
  aliases: readonly (Readonly<Record<string, string>> | undefined)[]
): (Record<string, string> | undefined)[] {
  return aliases.map(entry => (entry ? { ...entry } : undefined));
}

/** Deep-clone a `unitSubdivisionOverrides` array (see {@link cloneUnitAliases}). */
function cloneUnitSubdivisionOverrides(
  overrides: readonly (Readonly<Record<string, number>> | undefined)[]
): (Record<string, number> | undefined)[] {
  return overrides.map(entry => (entry ? { ...entry } : undefined));
}
