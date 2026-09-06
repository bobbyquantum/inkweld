import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
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
import { TranslocoModule } from '@jsverse/transloco';
import {
  readSceneMetadata,
  SCENE_STATUSES,
  sceneMetadataPatch,
  type SceneStatus,
} from '@models/scene-metadata';
import { type TimeSystem } from '@models/time-system';

import { INT_RE, unitsToTimePoint } from '../timeline-units';

export interface SceneDetailsDialogData {
  /** Scene name, shown in the title. */
  elementName: string;
  /** Current element metadata map. */
  metadata: Readonly<Record<string, string>>;
  /** Time systems installed in the project (for the story date). */
  timeSystems: readonly TimeSystem[];
}

export interface SceneDetailsDialogResult {
  /** Metadata patch to merge into the element. */
  patch: Record<string, string>;
}

/** Sentinel for "no story date". */
const NO_SYSTEM = '';

/**
 * Edit the structural metadata of a scene: draft status, synopsis, word
 * target and in-world story date. Returns a metadata patch; the caller
 * merges it into the element so the dialog never touches project state.
 */
@Component({
  selector: 'app-scene-details-dialog',
  templateUrl: './scene-details-dialog.component.html',
  styleUrl: './scene-details-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    TranslocoModule,
  ],
})
export class SceneDetailsDialogComponent {
  protected readonly data = inject<SceneDetailsDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<SceneDetailsDialogComponent, SceneDetailsDialogResult>
  );

  protected readonly statuses = SCENE_STATUSES;
  protected readonly noSystem = NO_SYSTEM;

  private readonly initial = readSceneMetadata(this.data.metadata);

  readonly status = signal<SceneStatus | ''>(this.initial.status ?? '');
  readonly synopsis = signal(this.initial.synopsis);
  readonly wordTarget = signal(
    this.initial.wordTarget !== undefined ? String(this.initial.wordTarget) : ''
  );
  // Only honour the stored system when it is actually installed; otherwise
  // the date cannot be edited and is treated as unset.
  readonly systemId = signal<string>(
    this.data.timeSystems.some(s => s.id === this.initial.storyDate?.systemId)
      ? this.initial.storyDate!.systemId
      : NO_SYSTEM
  );
  readonly units = signal<string[]>(this.initialUnits());

  /**
   * A stored date whose calendar is no longer installed cannot be shown or
   * edited here. Leave it untouched unless the user explicitly picks a
   * calendar (or "no story date"), so saving other fields never wipes it.
   */
  private readonly hasUnavailableStoryDate =
    this.initial.storyDate !== undefined && this.systemId() === NO_SYSTEM;
  private storyDateTouched = false;

  /** The selected time system, or null for "no story date". */
  readonly system = computed<TimeSystem | null>(() => {
    const id = this.systemId();
    if (id === NO_SYSTEM) return null;
    return this.data.timeSystems.find(s => s.id === id) ?? null;
  });

  /** Per-unit validity: empty is allowed only when *all* units are empty. */
  readonly unitsValid = computed(() => {
    const system = this.system();
    if (!system) return true;
    const units = this.units();
    if (units.every(u => u.trim() === '')) return true;
    return units.every(u => INT_RE.test(u.trim()));
  });

  readonly wordTargetValid = computed(() => {
    const raw = this.wordTarget().trim();
    if (raw === '') return true;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0;
  });

  readonly canSave = computed(
    () => this.unitsValid() && this.wordTargetValid()
  );

  private initialUnits(): string[] {
    const point = this.initial.storyDate;
    const system = point
      ? this.data.timeSystems.find(s => s.id === point.systemId)
      : undefined;
    if (!point || !system) return [];
    const n = system.unitLabels.length;
    const units = point.units.slice(0, n).map(String);
    while (units.length < n) units.push('');
    return units;
  }

  onSystemChange(id: string): void {
    this.storyDateTouched = true;
    this.systemId.set(id);
    const system = this.system();
    this.units.set(system ? system.unitLabels.map(() => '') : []);
  }

  onUnitChange(index: number, value: string): void {
    this.units.update(units => {
      const next = [...units];
      next[index] = value;
      return next;
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    if (!this.canSave()) return;

    const system = this.system();
    const units = this.units();
    const hasDate = system !== null && units.some(u => u.trim() !== '');
    const preserveExisting =
      this.hasUnavailableStoryDate && !this.storyDateTouched;
    const storyDate = preserveExisting
      ? undefined
      : hasDate
        ? unitsToTimePoint(units, system)
        : null;

    const rawTarget = this.wordTarget().trim();
    const status = this.status();

    const patch = sceneMetadataPatch({
      status: status === '' ? null : status,
      synopsis: this.synopsis(),
      wordTarget: rawTarget === '' ? null : Number(rawTarget),
      storyDate,
    });

    this.dialogRef.close({ patch });
  }
}
