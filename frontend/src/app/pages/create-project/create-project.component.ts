import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { FormField, form, pattern, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { type Project } from '@inkweld/index';
import { ElectronService } from '@services/electron.service';

import { ProjectActivationService } from '../../services/local/project-activation.service';
import { UnifiedProjectService } from '../../services/local/unified-project.service';
import {
  type ProjectTemplateInfo,
  ProjectTemplateService,
} from '../../services/project/project-template.service';
import { UnifiedUserService } from '../../services/user/unified-user.service';

interface ProjectFormValue {
  title: string;
  slug: string;
  description: string;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Component({
  selector: 'app-create-project',
  templateUrl: './create-project.component.html',
  styleUrls: ['./create-project.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    MatProgressBarModule,
    MatRadioModule,
    UserMenuComponent,
  ],
})
export class CreateProjectComponent implements OnInit {
  private readonly unifiedProjectService = inject(UnifiedProjectService);
  private readonly activationService = inject(ProjectActivationService);
  private readonly templateService = inject(ProjectTemplateService);
  private readonly electronService = inject(ElectronService);
  protected unifiedUserService = inject(UnifiedUserService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  /** Current step (1: template selection, 2: project details) */
  step = signal<1 | 2>(1);
  /** Available project templates */
  templates = signal<ProjectTemplateInfo[]>([]);
  /** Currently selected template ID */
  selectedTemplateId = signal<string>('worldbuilding-empty');
  /** Whether templates are loading */
  loadingTemplates = signal(true);

  readonly model = signal<ProjectFormValue>({
    title: '',
    slug: '',
    description: '',
  });

  readonly projectForm = form(this.model, schemaPath => {
    required(schemaPath.title, { message: 'Title is required' });
    required(schemaPath.slug, { message: 'Slug is required' });
    pattern(schemaPath.slug, SLUG_PATTERN, {
      message: 'Slug can only contain lowercase letters, numbers, and hyphens',
    });
  });

  projectUrl = '';
  baseUrl: string;
  username = '';
  readonly isSaving = signal(false);

  constructor() {
    // Use inkweld:// protocol in Electron, otherwise use current origin
    this.baseUrl = this.electronService.isElectron
      ? 'inkweld:/'
      : globalThis.location.origin;

    effect(() => {
      const title = this.projectForm.title().value();
      if (title) {
        const slug = this.generateSlug(title);
        this.projectForm.slug().value.set(slug);
        this.updateProjectUrl();
      }
    });

    effect(() => {
      // Read slug value to track changes
      this.projectForm.slug().value();
      this.updateProjectUrl();
    });

    effect(() => {
      const user = this.unifiedUserService.currentUser();
      this.username = user.username;
      this.updateProjectUrl();
    });
  }

  ngOnInit(): void {
    // Reset all state to ensure fresh start each time page is visited
    this.step.set(1);
    this.selectedTemplateId.set('worldbuilding-empty');
    this.loadingTemplates.set(true);
    this.isSaving.set(false);
    this.model.set({
      title: '',
      slug: '',
      description: '',
    });
    this.projectUrl = '';

    // Load available templates
    void this.loadTemplates();
  }

  generateSlug = (title: string): string => {
    return title
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/(^-|-$)/g, '');
  };

  updateProjectUrl = (): void => {
    const slug = this.model().slug;
    if (this.username && slug) {
      this.projectUrl = `${this.baseUrl}/${this.username}/${slug}`;
    } else {
      this.projectUrl = '';
    }
  };

  onCancel(): void {
    void this.router.navigate(['/']);
  }

  selectTemplate(templateId: string): void {
    this.selectedTemplateId.set(templateId);
  }

  nextStep(): void {
    this.step.set(2);
  }

  previousStep(): void {
    this.step.set(1);
  }

  private async loadTemplates(): Promise<void> {
    try {
      const templates = await this.templateService.getTemplates();
      this.templates.set(templates);
    } catch (error) {
      console.error('Failed to load templates:', error);
      // Fallback to empty template only
      this.templates.set([
        {
          id: 'empty',
          name: 'Empty Project',
          description: 'A blank slate to start from scratch.',
          icon: 'description',
          folder: 'empty',
        },
      ]);
    } finally {
      this.loadingTemplates.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.projectForm().invalid()) {
      return;
    }

    this.isSaving.set(true);
    try {
      const projectData: Partial<Project> = this.model();
      const templateId = this.selectedTemplateId();
      const response = await this.unifiedProjectService.createProject(
        projectData,
        templateId
      );

      this.snackBar.open('Project created successfully!', 'Close', {
        duration: 3000,
      });

      // Auto-activate on the creating device
      if (response?.username && response?.slug) {
        await this.activationService.activate(
          `${response.username}/${response.slug}`
        );
      }

      // Navigate to the new project
      if (response?.username && response?.slug) {
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
      this.isSaving.set(false);
    }
  }
}
