import { CommonModule } from '@angular/common';
import { Component, effect, inject } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { XsrfService } from '@services/xsrf.service';
import { ProjectAPIService, ProjectDto } from '@worm/index';

import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-new-project-dialog',
  templateUrl: './new-project-dialog.component.html',
  styleUrls: ['./new-project-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
  ],
})
export class NewProjectDialogComponent {
  projectForm = new FormGroup({
    title: new FormControl('', [Validators.required.bind(this)]),
    slug: new FormControl('', [
      Validators.required.bind(this),
      Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    ]),
    description: new FormControl(''),
  });
  projectUrl = '';
  baseUrl: string;
  username = '';
  isSaving = false;

  private fb = inject(FormBuilder);
  private projectAPIService = inject(ProjectAPIService);
  private userService = inject(UserService);
  private xsrfService = inject(XsrfService);
  private dialogRef = inject(MatDialogRef<NewProjectDialogComponent>);
  private snackBar = inject(MatSnackBar);

  constructor() {
    this.baseUrl = window.location.origin;

    this.projectForm
      .get('title')
      ?.valueChanges.subscribe((title: string | null) => {
        if (title) {
          const slug = this.generateSlug(title);
          this.projectForm.patchValue({ slug }, { emitEvent: false });
          this.updateProjectUrl();
        }
      });

    this.projectForm.get('slug')?.valueChanges.subscribe(() => {
      this.updateProjectUrl();
    });

    effect(
      () => {
        const user = this.userService.currentUser();
        this.username = user!.username;
        this.updateProjectUrl();
      },
      { allowSignalWrites: false }
    );
  }

  generateSlug = (title: string): string => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  };

  updateProjectUrl = (): void => {
    const slug = this.projectForm.get('slug')?.value;
    if (this.username && slug) {
      this.projectUrl = `${this.baseUrl}/${this.username}/${slug}`;
    } else {
      this.projectUrl = '';
    }
  };

  onCancel(): void {
    this.dialogRef.close();
  }

  async onSubmit(): Promise<void> {
    if (this.projectForm.invalid) {
      return;
    }

    this.isSaving = true;
    try {
      const xsrfToken = this.xsrfService.getXsrfToken();
      const projectData = this.projectForm.value as ProjectDto;

      const response = await this.projectAPIService
        .projectControllerCreateProject(xsrfToken, projectData)
        .toPromise();

      this.snackBar.open('Project created successfully!', 'Close', {
        duration: 3000,
      });
      this.dialogRef.close(response);
    } catch (error) {
      this.snackBar.open('Failed to create project.', 'Close', {
        duration: 3000,
      });
      console.error('Failed to create project:', error);
    } finally {
      this.isSaving = false;
    }
  }
}
