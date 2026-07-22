import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';

import {
  type AutoBuildCandidate,
  type AutoBuildDialogData,
  type AutoBuildDialogResult,
} from './timeline-auto-build-dialog.models';

@Component({
  selector: 'app-timeline-auto-build-dialog',
  templateUrl: './timeline-auto-build-dialog.component.html',
  styleUrls: ['./timeline-auto-build-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatCheckboxModule,
    MatTooltipModule,
    TranslocoModule,
  ],
})
export class TimelineAutoBuildDialogComponent {
  readonly data = inject<AutoBuildDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<
      MatDialogRef<TimelineAutoBuildDialogComponent, AutoBuildDialogResult>
    >(MatDialogRef);

  private readonly selectedKeys = signal<Set<string>>(
    new Set(
      this.data.candidates
        .filter(c => !c.alreadyOnTimeline)
        .map(c => candidateKey(c))
    )
  );

  readonly candidates = this.data.candidates;
  readonly systemName = this.data.systemName;

  isSelected(candidate: AutoBuildCandidate): boolean {
    return this.selectedKeys().has(candidateKey(candidate));
  }

  toggle(candidate: AutoBuildCandidate): void {
    const key = candidateKey(candidate);
    this.selectedKeys.update(set => {
      const next = new Set(set);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  selectAll(): void {
    this.selectedKeys.set(new Set(this.candidates.map(c => candidateKey(c))));
  }

  selectNone(): void {
    this.selectedKeys.set(new Set());
  }

  selectedCount(): number {
    return this.selectedKeys().size;
  }

  onBuild(): void {
    const selected = this.candidates.filter(c =>
      this.selectedKeys().has(candidateKey(c))
    );
    this.dialogRef.close({ kind: 'build', selected });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}

function candidateKey(c: AutoBuildCandidate): string {
  return `${c.elementId}::${c.fieldKey}`;
}
