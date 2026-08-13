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
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GlassCardComponent } from '@components/glass-card/glass-card.component';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import {
  type AppearanceRegion,
  type BackgroundMode,
  type BackgroundSetting,
  type BackgroundType,
  type ElementAppearance,
} from '@models/element-appearance';
import { APPEARANCE_DELETE } from '@models/element-appearance';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { debounceTime, Subject, takeUntil } from 'rxjs';

import { mediaIdFromReference } from '../../../utils/media-reference';
import { ColorPickerComponent } from './color-picker/color-picker.component';
import { GradientDesignerComponent } from './gradient-designer/gradient-designer.component';

/** Options for the background type picker. */
const BACKGROUND_TYPES: BackgroundType[] = ['color', 'gradient', 'image'];

/** The value slot being edited on a background setting. */
type BackgroundSlot = 'value' | 'light' | 'dark';

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

@Component({
  selector: 'app-appearance-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    MatSelectModule,
    MatSliderModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TranslocoModule,
    GlassCardComponent,
    ColorPickerComponent,
    GradientDesignerComponent,
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

  readonly regions: AppearanceRegion[] = ['menu', 'content'];
  readonly types = BACKGROUND_TYPES;
  readonly manualSlots: Array<'light' | 'dark'> = ['light', 'dark'];

  private readonly save$ = new Subject<SaveSnapshot>();
  private readonly destroy$ = new Subject<void>();
  private unsubscribeObserver: (() => void) | null = null;
  private hasLocalEdit = false;
  private editGeneration = 0;
  private elementSequence = 0;
  /** Keys ("region" or "region.slot") pending explicit deletion on next save. */
  private pendingDeletes: Record<string, true> = {};

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
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Editing
  // ---------------------------------------------------------------------------

  /** Whether a region has a custom background configured. */
  isEnabled(region: AppearanceRegion): boolean {
    return this.appearance()[region] !== undefined;
  }

  /** Get the working setting for a region, defaulting when unset. */
  getSetting(region: AppearanceRegion): BackgroundSetting {
    const stored = this.appearance()[region];
    return stored ? { ...stored } : { type: 'color', mode: 'auto' };
  }

  setType(region: AppearanceRegion, type: BackgroundType): void {
    this.patchSetting(region, { type });
  }

  setMode(region: AppearanceRegion, mode: BackgroundMode): void {
    this.patchSetting(region, { mode });
  }

  setIntensity(region: AppearanceRegion, intensity: number | string): void {
    this.patchSetting(region, { intensity: Number(intensity) });
  }

  setValue(
    region: AppearanceRegion,
    slot: BackgroundSlot,
    value: string
  ): void {
    this.patchSetting(region, { [slot]: value });
  }

  setEnabled(region: AppearanceRegion, enabled: boolean): void {
    this.hasLocalEdit = true;
    this.editGeneration++;
    this.appearance.update(a => {
      const next = { ...a };
      if (enabled) {
        next[region] = { type: 'color', mode: 'auto' };
        // Re-enabling cancels any pending deletion for this region/slots.
        delete this.pendingDeletes[region];
        for (const key of Object.keys(this.pendingDeletes)) {
          if (key.startsWith(`${region}.`)) delete this.pendingDeletes[key];
        }
      } else {
        delete next[region];
        // Record an explicit deletion so the persisted Yjs map drops the
        // region (a missing key alone means "leave unchanged").
        this.pendingDeletes[region] = true;
      }
      return next;
    });
    this.queueSave();
  }

  private patchSetting(
    region: AppearanceRegion,
    patch: Partial<BackgroundSetting>
  ): void {
    this.hasLocalEdit = true;
    this.editGeneration++;
    this.appearance.update(a => {
      const current = a[region] ?? { type: 'color', mode: 'auto' };
      const nextSetting: BackgroundSetting = { ...current, ...patch };
      // Trim empty string values so a cleared field doesn't persist blanks,
      // and record an explicit deletion so the stored value is removed.
      const clean: BackgroundSetting = {
        type: nextSetting.type,
        mode: nextSetting.mode,
      };
      if (nextSetting.intensity !== undefined) {
        clean.intensity = nextSetting.intensity;
      }
      for (const k of ['value', 'light', 'dark'] as const) {
        const v = nextSetting[k];
        if (v !== undefined && v !== '') {
          clean[k] = v;
          // A fresh value cancels any pending deletion for this slot.
          delete this.pendingDeletes[`${region}.${k}`];
        } else if (v === '') {
          this.pendingDeletes[`${region}.${k}`] = true;
        }
      }
      return { ...a, [region]: clean };
    });
    this.queueSave();
  }

  /**
   * Queue a debounced save, capturing the element identity and the current
   * appearance + deletion snapshot at queue time. This isolates the save from
   * later element changes: if the user switches elements before the debounce
   * fires, the queued save still writes to the element it was created for.
   */
  private queueSave(): void {
    this.save$.next({
      elementId: this.elementId(),
      username: this.username(),
      slug: this.slug(),
      appearance: { ...this.appearance() },
      pendingDeletes: { ...this.pendingDeletes },
    });
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
      // The local edit has been flushed; re-allow realtime updates for the
      // current element, unless the user edited again while saving.
      if (saveEditGeneration === this.editGeneration) {
        this.hasLocalEdit = false;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Image picking + preview
  // ---------------------------------------------------------------------------

  async pickImage(
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
    if (result?.selected && result.blob) {
      const filename = result.selected.filename || 'background.png';
      const reference = `media://${filename}`;
      this.setValue(region, slot, reference);
      void this.cacheBlob(reference, result.blob);
    }
  }

  /** Cache a picked blob under a media:// reference so it can be rendered. */
  private async cacheBlob(reference: string, blob: Blob): Promise<void> {
    const mediaId = mediaIdFromReference(reference);
    const projectKey = `${this.username()}/${this.slug()}`;
    await this.localStorage.saveMedia(projectKey, mediaId, blob, reference);
  }

  getSettingValue(region: AppearanceRegion, slot: BackgroundSlot): string {
    const setting = this.getSetting(region);
    return setting[slot] ?? '';
  }

  getRegionLabel(region: AppearanceRegion): string {
    return region === 'menu' ? 'menu' : 'content';
  }
}
