import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

export interface EditProjectDialogData {
  project: ProjectDto;
}
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { ProjectAPIService } from '../../../api-client/api/project-api.service';
import { ProjectDto } from '../../../api-client/model/project-dto';

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
  ],
})
export class EditProjectDialogComponent implements OnInit {
  form: FormGroup;
  isSaving = false;
  project!: ProjectDto;

  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<EditProjectDialogComponent>);
  private projectApi = inject(ProjectAPIService);
  private dialogData = inject<EditProjectDialogData>(MAT_DIALOG_DATA);

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

      if (!updatedProject.user?.username) {
        throw new Error('Project username is required');
      }

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
        this.projectApi.projectControllerUpdateProject(
          updatedProject.user.username,
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
      throw new Error(`Failed to update project: ${errorMessage}`);
    } finally {
      this.isSaving = false;
    }
  }
}
