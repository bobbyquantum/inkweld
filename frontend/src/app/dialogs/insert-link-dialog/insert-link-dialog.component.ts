import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormField, form, required, validate } from '@angular/forms/signals';
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
const ALLOWED_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel']);

interface InsertLinkFormValue {
  linkText: string;
  href: string;
  openInNewTab: boolean;
}

@Component({
  selector: 'app-insert-link-dialog',
  templateUrl: './insert-link-dialog.component.html',
  styleUrls: ['./insert-link-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormField,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatCheckboxModule,
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

  readonly model = signal<InsertLinkFormValue>({
    linkText: '',
    href: this.data.existingHref ?? 'https://',
    openInNewTab: true,
  });

  readonly form = form(this.model, schemaPath => {
    // Only required when there's no pre-existing selection
    if (!this.hasSelection) {
      required(schemaPath.linkText, { message: 'Link text is required' });
    }
    required(schemaPath.href, { message: 'A URL is required' });
    validate(schemaPath.href, ({ value }) => {
      const v = String(value() ?? '').trim();
      if (!v) return null; // required handles empty

      // Allow root-relative paths (/foo) and same-page anchors (#section)
      const isRelative = /^\/(?!\/)/.test(v) || v.startsWith('#');
      if (isRelative) return null;

      // Require an explicit protocol from the allow-list
      const protocolMatch = /^([a-zA-Z][a-zA-Z\d+\-.]*):/u.exec(v);
      const isAllowedProtocol =
        !!protocolMatch &&
        ALLOWED_PROTOCOLS.has(protocolMatch[1].toLowerCase());

      return isAllowedProtocol
        ? null
        : {
            kind: 'invalidUrl',
            message: 'Enter a valid URL (e.g. https://example.com)',
          };
    });
  });

  get hrefControl() {
    return this.form.href();
  }

  get linkTextControl() {
    return this.form.linkText();
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    if (this.form().valid()) {
      const href = String(this.model().href ?? '').trim();
      const linkText = this.hasSelection
        ? undefined
        : String(this.model().linkText ?? '').trim();

      this.dialogRef.close({
        href,
        openInNewTab: this.model().openInNewTab ?? true,
        linkText,
      });
    }
  }

  onRemoveLink(): void {
    this.dialogRef.close({ href: '', openInNewTab: false });
  }
}
