import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ProjectAPIService } from 'worm-api-client';
import { XsrfService } from '@services/xsrf.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-new-project',
  standalone: true,
  imports: [
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
  projectForm: FormGroup;

  private fb = inject(FormBuilder);
  private projectService = inject(ProjectAPIService);
  private xsrfService = inject(XsrfService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  constructor() {
    this.projectForm = this.fb.group({
      title: ['', Validators.required],
      description: [''],
    });
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
