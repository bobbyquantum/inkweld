import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  type OnInit,
  signal,
  untracked,
} from '@angular/core';
import {
  form,
  FormField,
  minLength,
  pattern,
  required,
} from '@angular/forms/signals';
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
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { slugify } from '@utils/string-utils';

import { ProjectActivationService } from '../../services/local/project-activation.service';
import { UnifiedProjectService } from '../../services/local/unified-project.service';
import { ProjectServiceError } from '../../services/project/project.service';
import {
  type ProjectTemplateCatalog,
  type ProjectTemplateInfo,
  ProjectTemplateService,
} from '../../services/project/project-template.service';
import { StorageUsageService } from '../../services/user/storage-usage.service';
import { UnifiedUserService } from '../../services/user/unified-user.service';

interface ProjectFormValue {
  title: string;
  slug: string;
  description: string;
}

const DEFAULT_GROUP_ID = 'worldbuilding';
const DEFAULT_TEMPLATE_ID = 'worldbuilding-empty';

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
    TranslocoModule,
    UserMenuComponent,
  ],
})
export class CreateProjectComponent implements OnInit {
  private readonly unifiedProjectService = inject(UnifiedProjectService);
  private readonly activationService = inject(ProjectActivationService);
  private readonly templateService = inject(ProjectTemplateService);
  protected unifiedUserService = inject(UnifiedUserService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly storageUsage = inject(StorageUsageService);

  /** Current step (1: template selection, 2: project details) */
  step = signal<1 | 2>(1);
  /** The kinds of project on offer and the templates inside them */
  catalog = signal<ProjectTemplateCatalog>({ groups: [], templates: [] });
  /** The kind of project picked in step 1 */
  selectedGroupId = signal<string>(DEFAULT_GROUP_ID);
  /** Currently selected template ID */
  selectedTemplateId = signal<string>(DEFAULT_TEMPLATE_ID);
  /** Templates of the picked kind: the bare starter first, then the demo */
  groupTemplates = computed<ProjectTemplateInfo[]>(() =>
    this.catalog()
      .templates.filter(t => t.group === this.selectedGroupId())
      .sort(
        (a, b) =>
          Number(a.variant === 'demo') - Number(b.variant === 'demo') ||
          a.name.localeCompare(b.name)
      )
  );
  /** The template that will be created */
  selectedTemplate = computed(() =>
    this.catalog().templates.find(t => t.id === this.selectedTemplateId())
  );
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
    // The server refuses shorter slugs; say so here instead of failing on create
    minLength(schemaPath.slug, 3, {
      message: this.transloco.translate('home.createProjectPage.slugMinLength'),
    });
    pattern(schemaPath.slug, SLUG_PATTERN, {
      message: 'Slug can only contain lowercase letters, numbers, and hyphens',
    });
  });

  readonly projectUrl = signal('');
  readonly baseUrl = globalThis.location.origin;
  username = '';
  readonly isSaving = signal(false);

  constructor() {
    effect(() => {
      const title = this.projectForm.title().value();
      if (title) {
        const slug = this.generateSlug(title);
        this.projectForm.slug().value.set(slug);
        // `updateProjectUrl` is invoked by the slug-tracking effect below;
        // calling it here would add `slug` to this effect's dependencies and
        // cause it to re-fire (and overwrite the user's manual slug edits)
        // on every slug change. Use `untracked` to avoid that.
        untracked(() => this.updateProjectUrl());
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
    this.selectedGroupId.set(DEFAULT_GROUP_ID);
    this.selectedTemplateId.set(DEFAULT_TEMPLATE_ID);
    this.loadingTemplates.set(true);
    this.isSaving.set(false);
    this.resetForm();

    // Load available templates
    void this.loadTemplates();
  }

  /** Clear the project details so a previous creation doesn't linger. */
  private resetForm(): void {
    this.model.set({
      title: '',
      slug: '',
      description: '',
    });
    this.projectUrl.set('');
  }

  generateSlug = (title: string): string => slugify(title);

  updateProjectUrl = (): void => {
    const slug = this.model().slug;
    if (this.username && slug) {
      this.projectUrl.set(`${this.baseUrl}/${this.username}/${slug}`);
    } else {
      this.projectUrl.set('');
    }
  };

  onCancel(): void {
    void this.router.navigate(['/']);
  }

  /**
   * Pick a kind of project. Keeps the kind of template already chosen (a demo
   * stays a demo) when the new kind has one, otherwise starts from its
   * starter.
   */
  selectGroup(groupId: string): void {
    if (groupId === this.selectedGroupId()) return;
    const current = this.selectedTemplate();
    this.selectedGroupId.set(groupId);
    const templates = this.groupTemplates();
    const next =
      templates.find(t => t.variant === current?.variant) ?? templates[0];
    if (next) this.selectedTemplateId.set(next.id);
  }

  selectTemplate(templateId: string): void {
    const template = this.catalog().templates.find(t => t.id === templateId);
    if (template?.group) this.selectedGroupId.set(template.group);
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
      const catalog = await this.templateService.getCatalog();
      this.catalog.set(catalog);
      // Start on the default, or on the first template when it is not offered
      const start =
        catalog.templates.find(t => t.id === DEFAULT_TEMPLATE_ID) ??
        catalog.templates[0];
      if (start) this.selectTemplate(start.id);
    } catch (error) {
      console.error('Failed to load templates:', error);
      // Fallback to empty template only
      this.catalog.set({
        groups: [
          {
            id: 'empty',
            name: 'Empty Project',
            description: 'A blank slate to start from scratch.',
            icon: 'description',
          },
        ],
        templates: [
          {
            id: 'empty',
            name: 'Empty Project',
            description: 'A blank slate to start from scratch.',
            icon: 'description',
            folder: 'empty',
            group: 'empty',
            variant: 'starter',
          },
        ],
      });
      this.selectTemplate('empty');
    } finally {
      this.loadingTemplates.set(false);
    }
  }

  async onSubmit(event?: Event): Promise<void> {
    // Signal-forms `[formField]` does not register a ControlContainer, so
    // the native `<form>` would submit via GET and reload the page. Prevent
    // the default submission and handle the action in-component.
    event?.preventDefault();
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

      this.snackBar.open(
        this.transloco.translate('project.snackbar.projectCreated'),
        this.transloco.translate('close'),
        { duration: 3000 }
      );

      // Clear the details once the project exists, so a user who returns to
      // this page (or the component is reused) doesn't see the previous
      // project's title/slug/description still filled in.
      this.resetForm();

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
      const quotaFull =
        error instanceof ProjectServiceError && error.code === 'QUOTA_EXCEEDED';
      if (quotaFull) {
        void this.storageUsage.load();
      }
      this.snackBar.open(
        this.transloco.translate(
          quotaFull ? 'settings.storage.projectCreateRefused' : 'errors.unknown'
        ),
        this.transloco.translate('close'),
        { duration: quotaFull ? 8000 : 3000 }
      );
      console.error('Failed to create project:', error);
    } finally {
      this.isSaving.set(false);
    }
  }
}
