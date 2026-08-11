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
import { TranslocoModule } from '@jsverse/transloco';
import { ColorPickerDirective } from 'ngx-color-picker';

export interface ColourChooserDialogData {
  /** Current hex colour to start from. */
  colour: string;
  /** Dialog title. */
  title?: string;
}

/**
 * A modal colour chooser. Renders ngx-color-picker inline inside a normal
 * Material dialog so it matches the app's other dialogs and avoids the popup
 * positioning issues seen when attaching it to a field in the editor.
 */
@Component({
  selector: 'app-colour-chooser-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDialogModule,
    TranslocoModule,
    ColorPickerDirective,
  ],
  templateUrl: './colour-chooser-dialog.component.html',
  styleUrl: './colour-chooser-dialog.component.scss',
})
export class ColourChooserDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<ColourChooserDialogComponent>
  );
  readonly data = inject<ColourChooserDialogData>(MAT_DIALOG_DATA);

  /** Working colour, updated as the user drags in the dialog. */
  readonly colour = signal(this.data?.colour ?? '#4fd8eb');

  onColourChange(colour: string): void {
    if (colour) {
      this.colour.set(colour);
    }
  }

  onApply(): void {
    this.dialogRef.close(this.colour());
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
