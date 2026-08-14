import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  type OnDestroy,
  output,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import {
  APPEARANCE_DELETE,
  type AppearanceRegion,
  type ElementAppearance,
} from '@models/element-appearance';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { debounceTime, Subject, takeUntil } from 'rxjs';

import {
  buildMediaReference,
  mediaIdFromReference,
} from '../../../utils/media-reference';
import {
  AppearanceEditorComponent,
  type BackgroundSlot,
} from './appearance-editor/appearance-editor.component';

/**
 * A snapshot of everything needed to persist an appearance edit, captured at
 * queue time so a debounced save is isolated from later element changes.
 */
interface SaveSnapshot {
  elementId: string;
  username: string;
  slug: string;
  appearance: ElementAppearance;
  pendingDeletes: Record<string, true>;
}

/**
 * Element appearance panel (the Styling tab).
 *
 * Loads and persists a single element's appearance, and renders the pure
 * {@link AppearanceEditorComponent} to edit it. The editor's `valueChange`
 * is applied to the local `appearance` signal, which is both debounce-saved
 * and emitted live so the editor previews backgrounds in real time.
 */
@Component({
  selector: 'app-appearance-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    TranslocoModule,
    AppearanceEditorComponent,
  ],
  templateUrl: './appearance-panel.component.html',
  styleUrl: './appearance-panel.component.scss',
})
export class AppearancePanelComponent implements OnDestroy {
  elementId = input.required<string>();
  username = input.required<string>();
  slug = input.required<string>();
  canWrite = input<boolean>(true);

  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly transloco = inject(TranslocoService);

  /** Current appearance config for this element. */
  readonly appearance = signal<ElementAppearance>({});

  /** Emits the current appearance whenever it changes (for live preview). */
  readonly appearanceChange = output<ElementAppearance>();

  private readonly save$ = new Subject<SaveSnapshot>();
  private readonly destroy$ = new Subject<void>();
  private unsubscribeObserver: (() => void) | null = null;
  private hasLocalEdit = false;
  private editGeneration = 0;
  private elementSequence = 0;
  /** Keys ("region" or "region.slot") pending explicit deletion on next save. */
  private pendingDeletes: Record<string, true> = {};
  /** Most recent snapshot still awaiting a debounced save. */
  private lastSnapshot: SaveSnapshot | null = null;

  constructor() {
    this.save$
      .pipe(takeUntil(this.destroy$), debounceTime(400))
      .subscribe(snapshot => {
        void this.persist(snapshot);
      });

    effect(() => {
      const id = this.elementId();
      if (id) {
        this.elementSequence++;
        this.hasLocalEdit = false;
        this.editGeneration = 0;
        this.pendingDeletes = {};
        // Clear the displayed appearance while the next element loads so a
        // stale value from the previous element isn't shown.
        this.appearance.set({});
        void this.load(id);
        void this.observe(id);
      }
    });

    // Emit the current appearance whenever it changes so the editor can apply
    // backgrounds live (e.g. while dragging the intensity slider).
    effect(() => {
      this.appearanceChange.emit(this.appearance());
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.unsubscribeObserver) {
      this.unsubscribeObserver();
      this.unsubscribeObserver = null;
    }
    this.flushPendingSave();
  }

  /** Handle an edit from the appearance editor. */
  protected onAppearanceEdited(appearance: ElementAppearance): void {
    this.hasLocalEdit = true;
    this.editGeneration++;
    this.appearance.set(appearance);
    this.queueSave();
  }

  /** Record keys that were explicitly cleared so the backend removes them. */
  protected onDeletes(keys: Record<string, true>): void {
    for (const key of Object.keys(keys)) {
      this.pendingDeletes[key] = true;
    }
    this.queueSave();
  }

  /** Open the project media selector to pick a background image. */
  protected async onImagePicker(
    region: AppearanceRegion,
    slot: BackgroundSlot
  ): Promise<void> {
    const result = await this.dialogGateway.openMediaSelectorDialog({
      username: this.username(),
      slug: this.slug(),
      filterType: 'image',
      title: this.transloco.translate(
        'worldbuilding.appearance.pickImageTitle'
      ),
    });
    if (result?.selected) {
      const reference = buildMediaReference(result.selected);
      // Cache the blob under the derived mediaId so the background resolves
      // immediately (no async server round-trip) instead of appearing late.
      if (result.blob) {
        const projectKey = `${this.username()}/${this.slug()}`;
        const mediaId = mediaIdFromReference(reference);
        await this.localStorage.saveMedia(
          projectKey,
          mediaId,
          result.blob,
          result.selected.filename
        );
      }
      this.onAppearanceEdited(
        this.withValue(this.appearance(), region, slot, reference)
      );
    }
  }

  /** Return a copy of the appearance with the given slot set to `value`. */
  private withValue(
    appearance: ElementAppearance,
    region: AppearanceRegion,
    slot: BackgroundSlot,
    value: string
  ): ElementAppearance {
    return {
      ...appearance,
      [region]: {
        ...(appearance[region] ?? { type: 'image', mode: 'auto' }),
        [slot]: value,
      },
    };
  }

  private async load(elementId: string): Promise<void> {
    const sequence = this.elementSequence;
    const data = await this.worldbuildingService.getIdentityData(
      elementId,
      this.username(),
      this.slug()
    );
    // Discard the result if the active element changed or the user has already
    // edited before the (async) load resolved.
    if (sequence !== this.elementSequence || this.hasLocalEdit) return;
    this.appearance.set(data.appearance ?? {});
  }

  private async observe(elementId: string): Promise<void> {
    const sequence = this.elementSequence;
    if (this.unsubscribeObserver) {
      this.unsubscribeObserver();
    }
    this.unsubscribeObserver =
      await this.worldbuildingService.observeIdentityChanges(
        elementId,
        data => {
          // Ignore remote updates for a stale element or while the user has
          // local edits in-flight.
          if (sequence !== this.elementSequence || this.hasLocalEdit) return;
          this.appearance.set(data.appearance ?? {});
        },
        this.username(),
        this.slug()
      );
  }

  /**
   * Queue a debounced save, capturing the element identity and the current
   * appearance + deletion snapshot at queue time. This isolates the save from
   * later element changes: if the user switches elements before the debounce
   * fires, the queued save still writes to the element it was created for.
   */
  private queueSave(): void {
    this.lastSnapshot = {
      elementId: this.elementId(),
      username: this.username(),
      slug: this.slug(),
      appearance: { ...this.appearance() },
      pendingDeletes: { ...this.pendingDeletes },
    };
    this.save$.next(this.lastSnapshot);
  }

  private async persist(snapshot: SaveSnapshot): Promise<void> {
    const payload: ElementAppearance = { ...snapshot.appearance };

    // Fold the snapshot's deletion markers into the payload so the backend
    // removes the corresponding Yjs keys.
    for (const key of Object.keys(snapshot.pendingDeletes)) {
      const [region, slot] = key.split('.');
      const regionKey = region as AppearanceRegion;
      if (!slot) {
        (payload as Record<string, unknown>)[regionKey] = APPEARANCE_DELETE;
      } else {
        const existing = payload[regionKey];
        const base: Record<string, unknown> =
          existing && typeof existing === 'object'
            ? { ...(existing as unknown as Record<string, unknown>) }
            : {};
        base[slot] = APPEARANCE_DELETE;
        (payload as Record<string, unknown>)[regionKey] = base;
      }
    }

    const saveEditGeneration = this.editGeneration;
    try {
      await this.worldbuildingService.saveIdentityData(
        snapshot.elementId,
        { appearance: payload },
        snapshot.username,
        snapshot.slug
      );
      // Persistence succeeded: drop the deletion markers that were folded in.
      for (const key of Object.keys(snapshot.pendingDeletes)) {
        delete this.pendingDeletes[key];
      }
    } catch {
      // Persistence failed: restore the deletion markers so a later save still
      // sends APPEARANCE_DELETE for the removed regions/slots.
      for (const key of Object.keys(snapshot.pendingDeletes)) {
        this.pendingDeletes[key] = true;
      }
    } finally {
      if (this.lastSnapshot === snapshot) {
        this.lastSnapshot = null;
      }
      // The local edit has been flushed; re-allow realtime updates for the
      // current element, unless the user edited again while saving.
      if (saveEditGeneration === this.editGeneration) {
        this.hasLocalEdit = false;
      }
    }
  }

  /**
   * Persist any edit still sitting in the debounce window immediately, so a
   * teardown (e.g. the responsive swap between the desktop Styling panel and
   * the mobile accordion, which mounts a fresh instance) doesn't lose it.
   */
  private flushPendingSave(): void {
    const snapshot = this.lastSnapshot;
    this.lastSnapshot = null;
    if (snapshot) {
      void this.persist(snapshot);
    }
  }
}
