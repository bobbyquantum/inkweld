import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
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

/** Options for the background type picker. */
const BACKGROUND_TYPES: BackgroundType[] = ['color', 'gradient', 'image'];

/** The value slot being edited on a background setting. */
type BackgroundSlot = 'value' | 'light' | 'dark';

@Component({
  selector: 'app-appearance-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TranslocoModule,
  ],
  templateUrl: './appearance-panel.component.html',
  styleUrl: './appearance-panel.component.scss',
})
export class AppearancePanelComponent {
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

  readonly regions: AppearanceRegion[] = ['menu', 'content'];
  readonly types = BACKGROUND_TYPES;
  readonly manualSlots: Array<'light' | 'dark'> = ['light', 'dark'];

  private readonly save$ = new Subject<void>();
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
      .subscribe(() => {
        void this.persist();
      });

    effect(() => {
      const id = this.elementId();
      if (id) {
        this.elementSequence++;
        this.hasLocalEdit = false;
        this.editGeneration = 0;
        this.pendingDeletes = {};
        void this.load(id);
        void this.observe(id);
      }
    });
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
    this.save$.next();
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
    this.save$.next();
  }

  private async persist(): Promise<void> {
    const appearance = this.appearance();
    const payload: ElementAppearance = { ...appearance };

    // Fold pending deletions into the payload so the backend removes the
    // corresponding Yjs keys.
    for (const key of Object.keys(this.pendingDeletes)) {
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
    this.pendingDeletes = {};

    const saveEditGeneration = this.editGeneration;
    try {
      await this.worldbuildingService.saveIdentityData(
        this.elementId(),
        { appearance: payload },
        this.username(),
        this.slug()
      );
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
