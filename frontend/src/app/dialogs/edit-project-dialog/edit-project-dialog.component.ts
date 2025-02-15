import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ProjectImportExportService } from '@services/project-import-export.service';
import { ProjectAPIService } from '@worm/api/project-api.service';
import { ProjectDto } from '@worm/model/project-dto';
import { firstValueFrom } from 'rxjs';

export interface EditProjectDialogData {
  project: ProjectDto;
}

@Component({
  selector: 'app-edit-project-dialog',
  templateUrl: './edit-project-dialog.component.html',
  styleUrls: ['./edit-project-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressBarModule,
    MatIconModule,
  ],
})
export class EditProjectDialogComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  form: FormGroup;
  isSaving = false;
  project!: ProjectDto;
  readonly importExportService = inject(ProjectImportExportService);

  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<EditProjectDialogComponent>);
  private projectAPIService = inject(ProjectAPIService);
  private dialogData = inject<EditProjectDialogData>(MAT_DIALOG_DATA);
  private snackBar = inject(MatSnackBar);

  constructor() {
    this.form = this.fb.group({
      title: ['', Validators.required.bind(this)],
      description: [''],
    });
  }

  ngOnInit(): void {
    this.project = this.dialogData.project;
    console.log('Project: ', this.project);
    this.form.patchValue({
      title: this.project.title,
      description: this.project.description,
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  async onSave(): Promise<void> {
    if (this.form.invalid) return;

    this.isSaving = true;
    try {
      interface FormValues {
        title: string;
        description: string;
      }

      const formValues = this.form.value as FormValues;
      const updatedProject: ProjectDto = {
        ...this.project,
        title: formValues.title,
        description: formValues.description,
      };

      if (!updatedProject.slug) {
        throw new Error('Project slug is required');
      }

      // Get XSRF token from cookies
      const xsrfToken =
        document.cookie
          .split('; ')
          .find(row => row.startsWith('XSRF-TOKEN='))
          ?.split('=')[1] || '';

      const response = await firstValueFrom(
        this.projectAPIService.projectControllerUpdateProject(
          updatedProject.user!.username,
          updatedProject.slug,
          xsrfToken,
          {
            title: updatedProject.title,
            description: updatedProject.description,
          } as ProjectDto
        )
      );
      this.dialogRef.close(response);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to update project:', errorMessage);
      this.showError(`Failed to update project: ${errorMessage}`);
    } finally {
      this.isSaving = false;
    }
  }

  async onExportClick(): Promise<void> {
    try {
      await this.importExportService.exportProjectZip();
      this.showSuccess('Project exported successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.showError(`Failed to export project: ${message}`);
    }
  }

  onImportClick(): void {
    this.fileInput.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      await this.importExportService.importProject(file);
      this.showSuccess('Project imported successfully');
      this.dialogRef.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.showError(`Failed to import project: ${message}`);
    } finally {
      // Clear the input so the same file can be selected again
      input.value = '';
    }
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      panelClass: ['error-snackbar'],
    });
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      panelClass: ['success-snackbar'],
    });
  }
}
