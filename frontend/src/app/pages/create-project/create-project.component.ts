import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
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
import { Project } from '@inkweld/index';
import { ElectronService } from '@services/electron.service';

import { UnifiedProjectService } from '../../services/local/unified-project.service';
import {
  ProjectTemplateInfo,
  ProjectTemplateService,
} from '../../services/project/project-template.service';
import { UnifiedUserService } from '../../services/user/unified-user.service';

interface ProjectForm {
  title: FormControl<string>;
  slug: FormControl<string>;
  description: FormControl<string>;
}

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
    MatRadioModule,
    UserMenuComponent,
  ],
})
export class CreateProjectComponent implements OnInit {
  private unifiedProjectService = inject(UnifiedProjectService);
  private templateService = inject(ProjectTemplateService);
  private electronService = inject(ElectronService);
  protected unifiedUserService = inject(UnifiedUserService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private fb = inject(FormBuilder).nonNullable;

  /** Current step (1: template selection, 2: project details) */
  step = signal<1 | 2>(1);
  /** Available project templates */
  templates = signal<ProjectTemplateInfo[]>([]);
  /** Currently selected template ID */
  selectedTemplateId = signal<string>('worldbuilding-empty');
  /** Whether templates are loading */
  loadingTemplates = signal(true);

  readonly projectForm = this.fb.group<ProjectForm>({
    title: this.fb.control('', { validators: [Validators.required] }),
    slug: this.fb.control('', {
      validators: [
        Validators.required,
        Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      ],
    }),
    description: this.fb.control(''),
  });
  projectUrl = '';
  baseUrl: string;
  username = '';
  readonly isSaving = signal(false);

  constructor() {
    // Use inkweld:// protocol in Electron, otherwise use current origin
    this.baseUrl = this.electronService.isElectron
      ? 'inkweld:/'
      : window.location.origin;

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

  ngOnInit(): void {
    // Reset all state to ensure fresh start each time page is visited
    this.step.set(1);
    this.selectedTemplateId.set('worldbuilding-empty');
    this.loadingTemplates.set(true);
    this.isSaving.set(false);
    this.projectForm.reset({
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
    if (this.projectForm.invalid) {
      return;
    }

    this.isSaving.set(true);
    try {
      const projectData = this.projectForm.value as Partial<Project>;
      const templateId = this.selectedTemplateId();
      const response = await this.unifiedProjectService.createProject(
        projectData,
        templateId
      );

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
      this.isSaving.set(false);
    }
  }
}
