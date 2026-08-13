import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  type OnDestroy,
  signal,
} from '@angular/core';
import {
  applyEach,
  form,
  FormField,
  required,
  validate,
  validateTree,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { DomSanitizer, type SafeUrl } from '@angular/platform-browser';
import { createMediaUrl, extractMediaId } from '@components/image-paste';
import { TranslocoModule } from '@jsverse/transloco';
import {
  isValidTimePointFor,
  type TimePoint,
  type TimeSystem,
  unitDropdownOptions,
  unitInputModeFor,
} from '@models/time-system';
import type { TimelineEra } from '@models/timeline.model';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LocalStorageService } from '@services/local/local-storage.service';

import {
  INT_RE,
  timePointToAbsoluteValue,
  unitsToTimePoint,
} from '../timeline-units';

export interface TimelineEraDialogData {
  /** Existing era for editing, or `null` to create a new one. */
  era: TimelineEra | null;
  system: TimeSystem;
  /** Seed range for new eras (shown as start/end defaults). */
  defaultStart?: TimePoint;
  defaultEnd?: TimePoint;
  defaultColor?: string;
  /** Project owner; required for the media-library background picker. */
  username?: string;
  /** Project slug; required for the media-library background picker. */
  slug?: string;
}

export type TimelineEraDialogResult =
  { kind: 'save'; era: TimelineEra } | { kind: 'delete'; eraId: string };

interface TimelineEraFormValue {
  name: string;
  startUnits: string[];
  endUnits: string[];
  color: string;
  /** `media:` URL of the background image, or empty for none. */
  imageUrl: string;
}

@Component({
  selector: 'app-timeline-era-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    TranslocoModule,
  ],
  templateUrl: './timeline-era-dialog.component.html',
  styleUrls: ['./timeline-era-dialog.component.scss'],
})
export class TimelineEraDialogComponent implements OnDestroy {
  protected readonly data = inject<TimelineEraDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<TimelineEraDialogComponent, TimelineEraDialogResult>>(
      MatDialogRef
    );
  private readonly dialogs = inject(DialogGatewayService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly isGregorian = computed(
    () => this.data.system.id === 'gregorian'
  );

  /** Resolved input mode for unit `i` (numeric or dropdown). */
  protected inputModeFor(i: number): 'numeric' | 'dropdown' {
    return unitInputModeFor(this.data.system, i);
  }

  /** Dropdown options for unit `i` (used only when input mode is dropdown). */
  protected optionsFor(
    i: number
  ): readonly { readonly value: string; readonly label: string }[] {
    return unitDropdownOptions(this.data.system, i);
  }

  private readonly startDateSignal = signal('');
  private readonly endDateSignal = signal('');
  protected readonly startDateValue = this.startDateSignal.asReadonly();
  protected readonly endDateValue = this.endDateSignal.asReadonly();

  private readonly seed = (point: TimePoint | undefined): string[] => {
    const n = this.data.system.unitLabels.length;
    if (point?.systemId === this.data.system.id) {
      return point.units.slice(0, n).map(String);
    }
    return Array.from({ length: n }, (_, i) => {
      const mode = unitInputModeFor(this.data.system, i);
      if (mode === 'dropdown') {
        const options = unitDropdownOptions(this.data.system, i);
        return options[0]?.value ?? '0';
      }
      const min = this.data.system.unitAllowZero?.[i] ? 0 : 1;
      return String(min);
    });
  };

  readonly model = signal<TimelineEraFormValue>({
    name: this.data.era?.name ?? '',
    startUnits: this.seed(this.data.era?.start ?? this.data.defaultStart),
    endUnits: this.seed(this.data.era?.end ?? this.data.defaultEnd),
    color: this.data.era?.color ?? this.data.defaultColor ?? '',
    imageUrl: this.data.era?.imageUrl ?? '',
  });

  /**
   * Preview of the selected background image. Object URLs created by this
   * dialog are tracked and revoked on destroy; URLs handed back by
   * {@link LocalStorageService.getMediaUrl} belong to its shared cache and
   * are intentionally never revoked here.
   */
  protected readonly imagePreview = signal<SafeUrl | null>(null);
  private previewObjectUrl: string | null = null;

  readonly form = form(this.model, schemaPath => {
    required(schemaPath.name, { message: 'Name is required' });
    required(schemaPath.color, { message: 'Color is required' });
    applyEach(schemaPath.startUnits, item => {
      validate(item, ({ value }) => {
        const v = String(value() ?? '').trim();
        if (v.length === 0) return { kind: 'required', message: 'Required' };
        return INT_RE.test(v)
          ? null
          : { kind: 'integer', message: 'Must be a whole number' };
      });
    });
    applyEach(schemaPath.endUnits, item => {
      validate(item, ({ value }) => {
        const v = String(value() ?? '').trim();
        if (v.length === 0) return { kind: 'required', message: 'Required' };
        return INT_RE.test(v)
          ? null
          : { kind: 'integer', message: 'Must be a whole number' };
      });
    });
    validateTree(schemaPath, ({ value }) => {
      const v = value();
      const start = unitsToTimePoint(v.startUnits, this.data.system);
      const end = unitsToTimePoint(v.endUnits, this.data.system);
      if (!start || !end) return null;
      if (
        !isValidTimePointFor(start, this.data.system) ||
        !isValidTimePointFor(end, this.data.system)
      ) {
        return {
          kind: 'invalidPoint',
          message: 'A date does not fit this time system',
        };
      }
      return timePointToAbsoluteValue(end, this.data.system) <
        timePointToAbsoluteValue(start, this.data.system)
        ? { kind: 'endBeforeStart', message: 'End must be at or after start' }
        : null;
    });
  });

  constructor() {
    // Derive ISO date strings reactively from model() so unit edits
    // recompute the date fields instead of reading stale data/defaults
    effect(() => {
      this.startDateSignal.set(this.unitsToIsoDateFromModel('start'));
      this.endDateSignal.set(this.unitsToIsoDateFromModel('end'));
    });
    void this.loadExistingImagePreview();
  }

  ngOnDestroy(): void {
    this.revokePreviewUrl();
  }

  /** Project key ("username/slug") used for media lookups, or null. */
  private get projectKey(): string | null {
    const { username, slug } = this.data;
    return username && slug ? `${username}/${slug}` : null;
  }

  /** Resolve the stored `media:` URL of an edited era into a preview. */
  private async loadExistingImagePreview(): Promise<void> {
    const imageUrl = this.data.era?.imageUrl;
    if (!imageUrl) return;
    const projectKey = this.projectKey;
    const mediaId = extractMediaId(imageUrl);
    if (!projectKey || !mediaId) return;
    try {
      const url = await this.localStorage.getMediaUrl(projectKey, mediaId);
      if (url && this.model().imageUrl === imageUrl) {
        // Shared cache URL — owned by LocalStorageService, never revoked here.
        this.imagePreview.set(this.sanitizer.bypassSecurityTrustUrl(url));
      }
    } catch {
      // Preview is cosmetic; a missing blob must not break the dialog.
    }
  }

  /** Open the media library and use the picked image as background. */
  protected async onChooseImage(): Promise<void> {
    const projectKey = this.projectKey;
    if (!projectKey || !this.data.username || !this.data.slug) return;
    const result = await this.dialogs.openMediaSelectorDialog({
      username: this.data.username,
      slug: this.data.slug,
      filterType: 'image',
      title: 'Select Background Image',
    });
    if (!result?.blob || !result.selected) return;
    const selected = result.selected;
    this.revokePreviewUrl();
    const objectUrl = URL.createObjectURL(result.blob);
    this.previewObjectUrl = objectUrl;
    this.imagePreview.set(this.sanitizer.bypassSecurityTrustUrl(objectUrl));
    this.model.update(m => ({
      ...m,
      imageUrl: createMediaUrl(selected.mediaId),
    }));
  }

  /** Clear the background image selection. */
  protected onRemoveImage(): void {
    this.revokePreviewUrl();
    this.imagePreview.set(null);
    this.model.update(m => ({ ...m, imageUrl: '' }));
  }

  private revokePreviewUrl(): void {
    if (this.previewObjectUrl) {
      URL.revokeObjectURL(this.previewObjectUrl);
      this.previewObjectUrl = null;
    }
  }

  protected onStartDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.applyIsoDateTo(value, 'start');
    this.startDateSignal.set(value);
  }
  protected onEndDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.applyIsoDateTo(value, 'end');
    this.endDateSignal.set(value);
  }

  private unitsToIsoDate(which: 'start' | 'end'): string {
    if (!this.isGregorian()) return '';
    const source =
      which === 'start'
        ? (this.data.era?.start ?? this.data.defaultStart)
        : (this.data.era?.end ?? this.data.defaultEnd);
    if (source?.units.length !== 3) return '';
    const [y, m, d] = source.units.map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      return '';
    }
    const yy = String(y).padStart(4, '0');
    const mm = String(Math.max(1, m)).padStart(2, '0');
    const dd = String(Math.max(1, d)).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  private unitsToIsoDateFromModel(which: 'start' | 'end'): string {
    if (!this.isGregorian()) return '';
    const units =
      which === 'start' ? this.model().startUnits : this.model().endUnits;
    if (units.length !== 3) return '';
    const [y, m, d] = units.map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      return '';
    }
    const yy = String(y).padStart(4, '0');
    const mm = String(Math.max(1, m)).padStart(2, '0');
    const dd = String(Math.max(1, d)).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  private applyIsoDateTo(iso: string, which: 'start' | 'end'): void {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return;
    const units = [m[1], String(Number(m[2])), String(Number(m[3]))];
    const key = which === 'start' ? 'startUnits' : 'endUnits';
    this.model.update(mv => {
      const arr = [...mv[key]];
      units.forEach((val, i) => {
        if (i < arr.length) arr[i] = val;
      });
      return { ...mv, [key]: arr };
    });
  }

  protected onCancel(): void {
    this.dialogRef.close();
  }

  protected onDelete(): void {
    if (!this.data.era) return;
    this.dialogRef.close({ kind: 'delete', eraId: this.data.era.id });
  }

  protected onSave(): void {
    if (this.form().invalid()) return;
    const raw = this.model();
    const trimmedName = raw.name.trim();
    const trimmedColor = raw.color.trim();

    if (trimmedName === '') return;
    if (trimmedColor === '') return;

    const start = unitsToTimePoint(raw.startUnits, this.data.system);
    const end = unitsToTimePoint(raw.endUnits, this.data.system);
    if (!start || !end) return;
    if (
      !isValidTimePointFor(start, this.data.system) ||
      !isValidTimePointFor(end, this.data.system)
    ) {
      return;
    }

    const trimmedImageUrl = raw.imageUrl.trim();
    const era: TimelineEra = {
      id: this.data.era?.id ?? '',
      name: trimmedName,
      start,
      end,
      color: trimmedColor,
      ...(trimmedImageUrl ? { imageUrl: trimmedImageUrl } : {}),
    };

    console.log('ERA-SAVE-DEBUG calling close', JSON.stringify(era));
    this.dialogRef.close({ kind: 'save', era });

    console.log('ERA-SAVE-DEBUG close returned');
  }
}
