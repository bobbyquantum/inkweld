import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { form, FormField, maxLength, required } from '@angular/forms/signals';
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
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import {
  type Announcement,
  AnnouncementService,
} from '@services/announcement/announcement.service';

export interface AnnouncementEditorDialogData {
  mode: 'create' | 'edit';
  announcement?: Announcement;
}

type AnnouncementType = 'announcement' | 'update' | 'maintenance';
type AnnouncementPriority = 'low' | 'normal' | 'high';

interface AnnouncementFormValue {
  title: string;
  content: string;
  type: AnnouncementType;
  priority: AnnouncementPriority;
  isPublic: boolean;
  expiresAt: Date | null;
}

@Component({
  selector: 'app-announcement-editor-dialog',
  imports: [
    FormField,
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    TranslocoModule,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './announcement-editor-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './announcement-editor-dialog.component.scss',
})
export class AnnouncementEditorDialogComponent implements OnInit {
  private readonly dialogRef = inject(
    MatDialogRef<AnnouncementEditorDialogComponent>
  );
  private readonly data = inject<AnnouncementEditorDialogData>(MAT_DIALOG_DATA);
  private readonly announcementService = inject(AnnouncementService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  isSubmitting = false;

  readonly isEditMode = this.data.mode === 'edit';
  readonly dialogTitle = this.isEditMode
    ? this.transloco.translate('admin.announcementEditor.editTitle')
    : this.transloco.translate('admin.announcementEditor.createTitle');

  readonly typeOptions = [
    {
      value: 'announcement',
      label: 'admin.announcementEditor.typeAnnouncement',
      icon: 'campaign',
    },
    {
      value: 'update',
      label: 'admin.announcementEditor.typeUpdate',
      icon: 'update',
    },
    {
      value: 'maintenance',
      label: 'admin.announcementEditor.typeMaintenance',
      icon: 'build',
    },
  ];

  readonly priorityOptions = [
    { value: 'low', label: 'admin.announcementEditor.priorityLow' },
    { value: 'normal', label: 'admin.announcementEditor.priorityNormal' },
    { value: 'high', label: 'admin.announcementEditor.priorityHigh' },
  ];

  readonly model = signal<AnnouncementFormValue>({
    title: '',
    content: '',
    type: 'announcement',
    priority: 'normal',
    isPublic: true,
    expiresAt: null,
  });

  readonly form = form(this.model, schemaPath => {
    required(schemaPath.title, { message: 'Title is required' });
    maxLength(schemaPath.title, 200, {
      message: 'Title must be 200 characters or less',
    });
    required(schemaPath.content, { message: 'Content is required' });
    maxLength(schemaPath.content, 10000, {
      message: 'Content must be 10,000 characters or less',
    });
    required(schemaPath.type, { message: 'Type is required' });
    required(schemaPath.priority, { message: 'Priority is required' });
  });

  ngOnInit(): void {
    const announcement = this.data.announcement;
    if (this.isEditMode && announcement) {
      this.model.set({
        title: announcement.title,
        content: announcement.content,
        type: announcement.type,
        priority: announcement.priority,
        isPublic: announcement.isPublic,
        expiresAt: announcement.expiresAt
          ? new Date(announcement.expiresAt)
          : null,
      });
    }
  }

  async submit(): Promise<void> {
    if (this.form().invalid() || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;

    try {
      const formValue = this.model();
      const data = {
        title: formValue.title.trim(),
        content: formValue.content.trim(),
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
