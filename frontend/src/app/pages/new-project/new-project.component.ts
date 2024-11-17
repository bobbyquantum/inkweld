import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import {
  FormBuilder,
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
import { ProjectAPIService, User, UserAPIService } from 'worm-api-client';

@Component({
  selector: 'app-new-project',
  standalone: true,
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
export class NewProjectComponent implements OnInit {
  projectForm: FormGroup;
  projectUrl = '';
  baseUrl: string;
  username = '';

  private fb = inject(FormBuilder);
  private projectService = inject(ProjectAPIService);
  private userService = inject(UserAPIService);
  private xsrfService = inject(XsrfService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  constructor() {
    this.baseUrl = window.location.origin;
    this.projectForm = this.fb.group({
      title: ['', Validators.required],
      slug: [
        '',
        [Validators.required, Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)],
      ],
      description: [''],
    });

    this.projectForm.get('title')?.valueChanges.subscribe(title => {
      if (title) {
        const slug = this.generateSlug(title);
        this.projectForm.patchValue({ slug }, { emitEvent: false });
        this.updateProjectUrl();
      }
    });

    this.projectForm.get('slug')?.valueChanges.subscribe(() => {
      this.updateProjectUrl();
    });
  }

  ngOnInit() {
    this.userService.getCurrentUser().subscribe({
      next: (user: User) => {
        if (user.username) {
          this.username = user.username;
          this.updateProjectUrl();
        } else {
          console.error('User object does not contain a username');
          this.snackBar.open('Failed to fetch user information.', 'Close', {
            duration: 3000,
          });
        }
      },
      error: err => {
        console.error('Error fetching current user', err);
        this.snackBar.open('Failed to fetch user information.', 'Close', {
          duration: 3000,
        });
      },
    });
  }

  generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  updateProjectUrl() {
    const slug = this.projectForm.get('slug')?.value;
    if (this.username && slug) {
      this.projectUrl = `${this.baseUrl}/${this.username}/${slug}`;
    } else {
      this.projectUrl = '';
    }
  }

  onSubmit() {
    if (this.projectForm.invalid) {
      return;
    }

    const xsrfToken = this.xsrfService.getXsrfToken();
    const projectData = this.projectForm.value;

    this.projectService.createProject(xsrfToken, projectData).subscribe({
      next: () => {
        this.snackBar.open('Project created successfully!', 'Close', {
          duration: 3000,
        });
        this.router.navigate(['/']);
      },
      error: err => {
        console.error('Error creating project', err);
        this.snackBar.open('Failed to create project.', 'Close', {
          duration: 3000,
        });
      },
    });
  }
}
