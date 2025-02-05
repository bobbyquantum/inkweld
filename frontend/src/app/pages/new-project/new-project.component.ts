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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterModule } from '@angular/router';
import { XsrfService } from '@services/xsrf.service';
import { ProjectAPIService, ProjectDto } from '@worm/index';

import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-new-project',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    RouterModule,
  ],
  templateUrl: './new-project.component.html',
  styleUrls: ['./new-project.component.scss'],
})
export class NewProjectComponent {
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

  private fb = inject(FormBuilder);
  private projectAPIService = inject(ProjectAPIService);
  private userService = inject(UserService);
  private xsrfService = inject(XsrfService);
  private router = inject(Router);
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

  onSubmit() {
    if (this.projectForm.invalid) {
      return;
    }

    const xsrfToken = this.xsrfService.getXsrfToken();
    const projectData = this.projectForm.value as ProjectDto;

    this.projectAPIService
      .projectControllerCreateProject(xsrfToken, projectData)
      .subscribe({
        next: () => {
          this.snackBar.open('Project created successfully!', 'Close', {
            duration: 3000,
          });
          void this.router.navigate(['/']);
        },
        error: () => {
          this.snackBar.open('Failed to create project.', 'Close', {
            duration: 3000,
          });
        },
      });
  }
}
