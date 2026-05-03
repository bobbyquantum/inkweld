import {
  type AfterViewInit,
  Component,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface RenameDialogData {
  currentName: string;
  title?: string;
}

@Component({
  selector: 'app-rename-dialog',
  templateUrl: './rename-dialog.component.html',
  styleUrls: ['./rename-dialog.component.scss'],
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
  ],
})
export class RenameDialogComponent implements AfterViewInit {
  protected readonly data = inject<RenameDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<RenameDialogComponent>);

  // Drive the input value + validity via a signal so the [disabled]
  // binding on the confirm button updates reliably in zoneless mode.
  // The DOM <input> is NOT bound with [value]: in zoneless mode a [value]
  // binding re-runs during CD and can interact poorly with rapid
  // Playwright fill() / select() sequences. Seed the DOM once via a
  // viewChild ref instead.
  readonly name = signal(this.data.currentName ?? '');
  readonly touched = signal(false);

  private readonly nameInput =
    viewChild<ElementRef<HTMLInputElement>>('nameInput');

  ngAfterViewInit(): void {
    queueMicrotask(() => {
      const el = this.nameInput()?.nativeElement;
      if (el) {
        el.value = this.name();
      }
    });
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.name.set(value);
  }

  onBlur(): void {
    this.touched.set(true);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    const value = this.name().trim();
    if (value.length > 0) {
      this.dialogRef.close(this.name());
    }
  }
}
