import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GlassCardComponent } from '@components/glass-card/glass-card.component';
import { TranslocoModule } from '@jsverse/transloco';
import {
  type AppearanceRegion,
  type BackgroundMode,
  type BackgroundSetting,
  type BackgroundType,
  type ElementAppearance,
} from '@models/element-appearance';
import { mediaReferenceFilename } from '@utils/media-reference';

import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { GradientDesignerComponent } from '../gradient-designer/gradient-designer.component';

/** Options for the background type picker. */
const BACKGROUND_TYPES: BackgroundType[] = ['color', 'gradient', 'image'];

/** The value slot being edited on a background setting. */
export type BackgroundSlot = 'value' | 'light' | 'dark';

/**
 * A pure, persistence-free editor for an element's background appearance.
 *
 * Owns no data-loading or save logic: it simply edits an {@link ElementAppearance}
 * supplied via the `value` input and emits the updated value via `valueChange`.
 * Used by both the element Styling panel (which adds persistence) and the
 * schema designer (which edits a template's default appearance).
 *
 * When a region is disabled or a value slot is cleared, the corresponding key
 * is reported via the `deletes` output so a persistence layer can issue an
 * explicit removal (rather than leaving a stale value behind).
 *
 * Image backgrounds are chosen through a project media selector. The parent
 * supplies this via the `imagePicker` output, which receives the target region
 * and slot; the parent is responsible for opening the picker, caching any blob,
 * and feeding the resulting `media://` reference back to `setValue`.
 */
@Component({
  selector: 'app-appearance-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    MatSliderModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TranslocoModule,
    GlassCardComponent,
    ColorPickerComponent,
    GradientDesignerComponent,
  ],
  templateUrl: './appearance-editor.component.html',
  styleUrl: './appearance-editor.component.scss',
})
export class AppearanceEditorComponent {
  /** The appearance being edited. */
  value = input<ElementAppearance>({});
  disabled = input<boolean>(false);

  /** Emits the edited appearance on every change. */
  readonly valueChange = output<ElementAppearance>();

  /** Emits keys ("region" or "region.slot") that were explicitly cleared. */
  readonly deletes = output<Record<string, true>>();

  /** Requests that the parent open a media picker for an image background slot. */
  readonly imagePicker = output<{
    region: AppearanceRegion;
    slot: BackgroundSlot;
  }>();

  readonly regions: AppearanceRegion[] = ['menu', 'content'];
  readonly types = BACKGROUND_TYPES;
  readonly manualSlots: Array<'light' | 'dark'> = ['light', 'dark'];

  /** Working copy of the appearance, synced from `value`. */
  protected readonly model = computed<ElementAppearance>(() => ({
    ...this.value(),
  }));

  /** Whether a region has a custom background configured. */
  protected isEnabled(region: AppearanceRegion): boolean {
    return this.model()[region] !== undefined;
  }

  /** Get the working setting for a region, defaulting when unset. */
  protected getSetting(region: AppearanceRegion): BackgroundSetting {
    const stored = this.model()[region];
    return stored ? { ...stored } : { type: 'color', mode: 'auto' };
  }

  protected setType(region: AppearanceRegion, type: BackgroundType): void {
    this.patchSetting(region, { type });
  }

  protected setMode(region: AppearanceRegion, mode: BackgroundMode): void {
    this.patchSetting(region, { mode });
  }

  protected setIntensity(
    region: AppearanceRegion,
    intensity: number | string
  ): void {
    this.patchSetting(region, { intensity: Number(intensity) });
  }

  protected setValue(
    region: AppearanceRegion,
    slot: BackgroundSlot,
    value: string
  ): void {
    this.patchSetting(region, { [slot]: value });
  }

  protected setEnabled(region: AppearanceRegion, enabled: boolean): void {
    const deletes: Record<string, true> = {};
    if (!enabled) {
      deletes[region] = true;
    }
    this.emit(a => {
      const next = { ...a };
      if (enabled) {
        next[region] = { type: 'color', mode: 'auto' };
      } else {
        delete next[region];
      }
      return next;
    }, deletes);
  }

  private patchSetting(
    region: AppearanceRegion,
    patch: Partial<BackgroundSetting>
  ): void {
    const deletes: Record<string, true> = {};
    this.emit(a => {
      const current = a[region] ?? { type: 'color', mode: 'auto' };
      const merged: BackgroundSetting = { ...current, ...patch };
      const clean: BackgroundSetting = {
        type: merged.type,
        mode: merged.mode,
      };
      if (merged.intensity !== undefined) {
        clean.intensity = merged.intensity;
      }
      for (const k of ['value', 'light', 'dark'] as const) {
        const v = merged[k];
        if (v !== undefined && v !== '') {
          clean[k] = v;
        } else if (v === '') {
          deletes[`${region}.${k}`] = true;
        }
      }
      return { ...a, [region]: clean };
    }, deletes);
  }

  /**
   * Apply a pure transformation to the current value and emit it, along with
   * any keys that were explicitly cleared.
   */
  private emit(
    transform: (current: ElementAppearance) => ElementAppearance,
    deletes?: Record<string, true>
  ): void {
    this.valueChange.emit(transform(this.model()));
    if (deletes && Object.keys(deletes).length > 0) {
      this.deletes.emit(deletes);
    }
  }

  protected getSettingValue(
    region: AppearanceRegion,
    slot: BackgroundSlot
  ): string {
    const setting = this.getSetting(region);
    return setting[slot] ?? '';
  }

  /** The current image value for a slot, or '' when unset. */
  protected getImageValue(
    region: AppearanceRegion,
    slot: BackgroundSlot
  ): string {
    return this.getSettingValue(region, slot);
  }

  /** Human-readable filename of a `media://` reference (or the raw ref). */
  protected imageFilename(value: string): string {
    return value ? mediaReferenceFilename(value) : '';
  }
}
