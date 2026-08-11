import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';

/**
 * A colour chooser for a solid background colour.
 *
 * Opens a normal modal colour dialog (matching the app's other dialogs) so the
 * picker stays in place and doesn't suffer popup positioning issues inside the
 * editor. Emits a normalized hex string.
 */
@Component({
  selector: 'app-color-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.scss',
})
export class ColorPickerComponent {
  private readonly dialogGateway = inject(DialogGatewayService);

  /** Current color as a `#rrggbb` string. */
  value = input<string>('');
  disabled = input<boolean>(false);

  /** Emits the normalized `#rrggbb` color whenever the user changes it. */
  readonly valueChange = output<string>();

  protected async openPicker(): Promise<void> {
    if (this.disabled()) return;
    const colour = await this.dialogGateway.openColourChooserDialog({
      colour: this.value(),
    });
    if (colour) {
      this.valueChange.emit(colour);
    }
  }
}
