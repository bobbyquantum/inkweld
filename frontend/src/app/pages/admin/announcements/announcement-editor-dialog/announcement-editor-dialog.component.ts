import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  type OnInit,
  signal,
  viewChild,
} from '@angular/core';
import {
  FormBuilder,
  type FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  type Announcement,
  AnnouncementService,
} from '@services/announcement/announcement.service';

export interface AnnouncementEditorDialogData {
  mode: 'create' | 'edit';
  announcement?: Announcement;
}

interface AnnouncementFormValue {
  type: 'announcement' | 'update' | 'maintenance';
  priority: 'low' | 'normal' | 'high';
  isPublic: boolean;
  expiresAt: Date | null;
}

@Component({
  selector: 'app-announcement-editor-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './announcement-editor-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './announcement-editor-dialog.component.scss',
})
export class AnnouncementEditorDialogComponent
  implements OnInit, AfterViewInit
{
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(
    MatDialogRef<AnnouncementEditorDialogComponent>
  );
  private readonly data = inject<AnnouncementEditorDialogData>(MAT_DIALOG_DATA);
  private readonly announcementService = inject(AnnouncementService);
  private readonly snackBar = inject(MatSnackBar);

  // Refs used to seed the DOM value in edit mode without using [value]
  // (which would re-write during every CD cycle and clobber user input).
  readonly titleInputRef =
    viewChild<ElementRef<HTMLInputElement>>('titleInput');
  readonly contentInputRef =
    viewChild<ElementRef<HTMLTextAreaElement>>('contentInput');

  // Title/content as signals with (input) handlers — the canonical
  // zoneless Angular pattern. Plain [(ngModel)] doesn't trigger CD on
  // typing in zoneless mode, so [disabled] bindings never update.
  readonly titleStr = signal('');
  readonly contentStr = signal('');

  readonly isFormValid = computed(() => {
    const t = this.titleStr();
    const c = this.contentStr();
    return (
      t.trim().length > 0 &&
      t.length <= 200 &&
      c.trim().length > 0 &&
      c.length <= 10000
    );
  });

  // FormGroup for mat-select, mat-checkbox, mat-datepicker fields only.
  form!: FormGroup;
  isSubmitting = false;

  readonly isEditMode = this.data.mode === 'edit';
  readonly dialogTitle = this.isEditMode
    ? 'Edit Announcement'
    : 'Create Announcement';

  readonly typeOptions = [
    { value: 'announcement', label: 'Announcement', icon: 'campaign' },
    { value: 'update', label: 'Update', icon: 'update' },
    { value: 'maintenance', label: 'Maintenance', icon: 'build' },
  ];

  readonly priorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'normal', label: 'Normal' },
    { value: 'high', label: 'High' },
  ];

  onTitleInput(event: Event): void {
    this.titleStr.set((event.target as HTMLInputElement).value);
  }

  onContentInput(event: Event): void {
    this.contentStr.set((event.target as HTMLTextAreaElement).value);
  }

  ngOnInit(): void {
    // Only seed in edit mode. In create mode, signals stay at their
    // initial '' value (set in field initializer above). We avoid
    // unconditionally re-setting here because Playwright's fill() in e2e
    // tests can fire input events *before* ngOnInit runs (the dialog
    // template is rendered very early), and re-seeding to '' would
    // clobber the user-typed values.
    const announcement = this.data.announcement;
    if (this.isEditMode && announcement) {
      this.titleStr.set(announcement.title);
      this.contentStr.set(announcement.content);
    }

    this.form = this.fb.group({
      type: [announcement?.type || 'announcement', Validators.required],
      priority: [announcement?.priority || 'normal', Validators.required],
      isPublic: [announcement?.isPublic ?? true],
      expiresAt: [
        announcement?.expiresAt ? new Date(announcement.expiresAt) : null,
      ],
    });
  }

  ngAfterViewInit(): void {
    // Seed DOM input values once in edit mode. We avoid [value]/[(ngModel)]
    // bindings because they re-write on every CD cycle and can clobber user
    // edits during interactions with other form controls (mat-checkbox,
    // mat-select) in zoneless mode. Defer to a microtask so the write
    // doesn't happen during the same CD cycle that just finished
    // (avoids ExpressionChangedAfterItHasBeenCheckedError in tests).
    if (this.isEditMode) {
      queueMicrotask(() => {
        const titleEl = this.titleInputRef()?.nativeElement;
        const contentEl = this.contentInputRef()?.nativeElement;
        if (titleEl) titleEl.value = this.titleStr();
        if (contentEl) contentEl.value = this.contentStr();
      });
    }
  }

  async submit(): Promise<void> {
    if (!this.isFormValid() || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;

    try {
      const formValue = this.form.value as AnnouncementFormValue;
      const data = {
        title: this.titleStr(),
        content: this.contentStr(),
        type: formValue.type,
        priority: formValue.priority,
        isPublic: formValue.isPublic,
        expiresAt: formValue.expiresAt
          ? formValue.expiresAt.toISOString()
          : null,
      };

      if (this.isEditMode && this.data.announcement) {
        await this.announcementService.updateAnnouncement(
          this.data.announcement.id,
          data
        );
      } else {
        await this.announcementService.createAnnouncement(data);
      }

      this.dialogRef.close(true);
    } catch {
      this.snackBar.open(
        `Failed to ${this.isEditMode ? 'update' : 'create'} announcement`,
        'Dismiss',
        { duration: 5000 }
      );
    } finally {
      this.isSubmitting = false;
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
