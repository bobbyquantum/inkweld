import { Component, inject, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
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
  Announcement,
  AnnouncementService,
} from '@services/announcement/announcement.service';

export interface AnnouncementEditorDialogData {
  mode: 'create' | 'edit';
  announcement?: Announcement;
}

interface AnnouncementFormValue {
  title: string;
  content: string;
  type: 'announcement' | 'update' | 'maintenance';
  priority: 'low' | 'normal' | 'high';
  isPublic: boolean;
  expiresAt: Date | null;
}

@Component({
  selector: 'app-announcement-editor-dialog',
  standalone: true,
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
  styleUrl: './announcement-editor-dialog.component.scss',
})
export class AnnouncementEditorDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(
    MatDialogRef<AnnouncementEditorDialogComponent>
  );
  private readonly data = inject<AnnouncementEditorDialogData>(MAT_DIALOG_DATA);
  private readonly announcementService = inject(AnnouncementService);
  private readonly snackBar = inject(MatSnackBar);

  form!: FormGroup;
  isSubmitting = false;

  readonly isEditMode = this.data.mode === 'edit';
  readonly title = this.isEditMode
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

  ngOnInit(): void {
    this.initForm();
  }

  private initForm(): void {
    const announcement = this.data.announcement;

    this.form = this.fb.group({
      title: [
        announcement?.title || '',
        [Validators.required, Validators.maxLength(200)],
      ],
      content: [
        announcement?.content || '',
        [Validators.required, Validators.maxLength(10000)],
      ],
      type: [announcement?.type || 'announcement', Validators.required],
      priority: [announcement?.priority || 'normal', Validators.required],
      isPublic: [announcement?.isPublic ?? true],
      expiresAt: [
        announcement?.expiresAt ? new Date(announcement.expiresAt) : null,
      ],
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;

    try {
      const formValue = this.form.value as AnnouncementFormValue;
      const data = {
        title: formValue.title,
        content: formValue.content,
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
