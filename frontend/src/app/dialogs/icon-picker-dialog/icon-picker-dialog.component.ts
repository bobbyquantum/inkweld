import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';

export interface IconPickerDialogData {
  /** Currently selected icon name. */
  current: string;
  /** Icons to offer. */
  icons: string[];
  /** Dialog title (translation key). */
  titleKey: string;
}

/**
 * A modal grid of icon choices. Returns the chosen icon name, or undefined
 * when cancelled.
 */
@Component({
  selector: 'app-icon-picker-dialog',
  templateUrl: './icon-picker-dialog.component.html',
  styleUrls: ['./icon-picker-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslocoModule],
})
export class IconPickerDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<IconPickerDialogComponent>);
  protected readonly data = inject<IconPickerDialogData>(MAT_DIALOG_DATA);

  protected readonly selected = signal(this.data.current);

  protected choose(icon: string): void {
    this.selected.set(icon);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    this.dialogRef.close(this.selected());
  }
}
