import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { Project } from '@inkweld/index';

import { UnifiedProjectService } from '../../services/unified-project.service';
import { UnifiedUserService } from '../../services/unified-user.service';

@Component({
  selector: 'app-create-project',
  templateUrl: './create-project.component.html',
  styleUrls: ['./create-project.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    MatProgressBarModule,
    UserMenuComponent,
  ],
})
export class CreateProjectComponent {
  private unifiedProjectService = inject(UnifiedProjectService);
  protected unifiedUserService = inject(UnifiedUserService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  projectForm = this.fb.group({
    title: ['', [Validators.required]],
    slug: [
      '',
      [Validators.required, Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)],
    ],
    description: [''],
  });
  projectUrl = '';
  baseUrl: string;
  username = '';
  isSaving = false;

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

    effect(() => {
      const user = this.unifiedUserService.currentUser();
      this.username = user.username;
      this.updateProjectUrl();
    });
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
    void this.router.navigate(['/']);
  }

  async onSubmit(): Promise<void> {
    if (this.projectForm.invalid) {
      return;
    }

    this.isSaving = true;
    try {
      const projectData = this.projectForm.value as Partial<Project>;
      const response =
        await this.unifiedProjectService.createProject(projectData);

      this.snackBar.open('Project created successfully!', 'Close', {
        duration: 3000,
      });

      // Navigate to the new project
      if (response && response.username && response.slug) {
        void this.router.navigate(['/', response.username, response.slug]);
      } else {
        void this.router.navigate(['/']);
      }
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
