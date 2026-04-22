import { Component, inject } from '@angular/core';
import {
  type AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

export interface InsertLinkDialogData {
  /** Pre-filled URL (used when editing an existing link) */
  existingHref?: string;
  /**
   * The selected text that will become the link text.
   * When provided, no text field is shown — the selection is used as-is.
   * When absent, a text field is shown so the user can type the link text.
   */
  selectedText?: string;
}

export interface InsertLinkDialogResult {
  /** The URL to link to. Empty string means "remove the link". */
  href: string;
  /** Whether the link should open in a new tab */
  openInNewTab: boolean;
  /**
   * Link text to insert at the cursor. Only present when there was no
   * pre-existing selection (i.e. the dialog showed a text field).
   */
  linkText?: string;
}

/** Safe protocol allow-list for link URLs */
const ALLOWED_PROTOCOLS = ['http', 'https', 'mailto', 'tel'];

/** Validates that the value looks like a safe URL (blocks javascript: etc.) */
function urlValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) return null; // required handles empty

  // Allow root-relative paths (/foo) and same-page anchors (#section)
  const isRelative = /^\/(?!\/)/.test(value) || value.startsWith('#');
  if (isRelative) return null;

  // Require an explicit protocol from the allow-list
  const protocolMatch = /^([a-zA-Z][a-zA-Z\d+\-.]*):/u.exec(value);
  const isAllowedProtocol =
    !!protocolMatch &&
    ALLOWED_PROTOCOLS.includes(protocolMatch[1].toLowerCase());

  return isAllowedProtocol ? null : { invalidUrl: true };
}

@Component({
  selector: 'app-insert-link-dialog',
  templateUrl: './insert-link-dialog.component.html',
  styleUrls: ['./insert-link-dialog.component.scss'],
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatCheckboxModule,
    ReactiveFormsModule,
  ],
})
export class InsertLinkDialogComponent {
  protected readonly data = inject<InsertLinkDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<InsertLinkDialogComponent, InsertLinkDialogResult>
  );

  /** True when editing an existing link (pre-filled URL) */
  protected readonly isEditing = !!this.data.existingHref;

  /**
   * True when the caller had text selected — in this mode we don't show the
   * link-text field because the selection itself becomes the link text.
   */
  protected readonly hasSelection = !!this.data.selectedText;

  protected readonly form = new FormGroup({
    linkText: new FormControl(
      '',
      // Only required when there's no pre-existing selection
      this.hasSelection ? [] : [Validators.required]
    ),
    href: new FormControl(this.data.existingHref ?? 'https://', [
      Validators.required,
      urlValidator,
    ]),
    openInNewTab: new FormControl(true),
  });

  get hrefControl(): FormControl {
    return this.form.controls.href;
  }

  get linkTextControl(): FormControl {
    return this.form.controls.linkText;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    if (this.form.valid) {
      const href = String(this.hrefControl.value ?? '').trim();
      const linkText = this.hasSelection
        ? undefined
        : String(this.linkTextControl.value ?? '').trim();

      this.dialogRef.close({
        href,
        openInNewTab: this.form.controls.openInNewTab.value ?? true,
        linkText,
      });
    }
  }

  onRemoveLink(): void {
    this.dialogRef.close({ href: '', openInNewTab: false });
  }
}
