import { NgIf } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig, moduleMetadata } from '@storybook/angular';
import { ProjectDto, ProjectElementDto } from '@worm/index';
import { of } from 'rxjs';

import { ElementEditorComponent } from '../../components/element-editor/element-editor.component';
import { ProjectMainMenuComponent } from '../../components/project-main-menu/project-main-menu.component';
import { ProjectTreeComponent } from '../../components/project-tree/project-tree.component';
import { ProjectStateService } from '../../services/project-state.service';
import { ProjectComponent } from './project.component';

// Mock ProjectStateService
class MockProjectStateService implements Partial<ProjectStateService> {
  project = signal<ProjectDto | null>(null);
  elements = signal<ProjectElementDto[]>([]);
  openFiles = signal<ProjectElementDto[]>([]);
  selectedTabIndex = signal(0);
  isLoading = signal(false);
  isSaving = signal(false);
  error = signal<string | undefined>(undefined);

  async loadProject(): Promise<void> {
    // Mock implementation
  }

  async loadProjectElements(): Promise<void> {
    // Mock implementation
  }

  openFile(element: ProjectElementDto): void {
    const files = this.openFiles();
    const alreadyOpen = files.some(f => f.id === element.id);
    if (!alreadyOpen) {
      this.openFiles.update(files => [...files, element]);
    }
    const index = this.openFiles().findIndex(f => f.id === element.id);
    this.selectedTabIndex.set(index);
  }

  closeFile(index: number): void {
    this.openFiles.update(files => files.filter((_, i) => i !== index));
    const filesLength = this.openFiles().length;
    if (this.selectedTabIndex() >= filesLength) {
      this.selectedTabIndex.set(filesLength - 1);
    }
  }

  updateElements(elements: ProjectElementDto[]): void {
    this.elements.set(elements);
  }

  async saveProjectElements(): Promise<void> {
    // Mock implementation
  }
}

const meta: Meta<ProjectComponent> = {
  title: 'Pages/Project',
  component: ProjectComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        NgIf,
        MatButtonModule,
        MatSidenavModule,
        MatTabsModule,
        MatIconModule,
        MatProgressSpinnerModule,
        ProjectMainMenuComponent,
        ProjectTreeComponent,
        ElementEditorComponent,
      ],
      providers: [
        {
          provide: ProjectStateService,
          useClass: MockProjectStateService,
        },
        {
          provide: MatSnackBar,
          useValue: {
            open: () => {},
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ username: 'test-user', slug: 'test-project' }),
          },
        },
      ],
    }),
    applicationConfig({
      providers: [provideRouter([]), provideHttpClient()],
    }),
  ],
};

export default meta;
type Story = StoryObj<ProjectComponent>;

export const Loading: Story = {
  render: args => ({
    props: {
      ...args,
      projectState: {
        ...new MockProjectStateService(),
        isLoading: signal(true),
      },
    },
  }),
};

export const Empty: Story = {
  render: args => ({
    props: {
      ...args,
      projectState: {
        ...new MockProjectStateService(),
        project: signal<Project>({
          id: '1',
          title: 'Test Project',
          slug: 'test-project',
          description: 'A test project',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
        }),
        elements: signal<ProjectElementDto[]>([]),
        openFiles: signal<ProjectElementDto[]>([]),
      },
    },
  }),
};

export const WithOpenFiles: Story = {
  render: args => ({
    props: {
      ...args,
      projectState: {
        ...new MockProjectStateService(),
        project: signal<Project>({
          id: '1',
          title: 'Test Project',
          slug: 'test-project',
          description: 'A test project',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
        }),
        elements: signal<ProjectElementDto[]>([
          {
            id: '1',
            name: 'main.ts',
            level: 0,
            position: 0,
            type: ProjectElementDto.TypeEnum.Item,
          },
          {
            id: '2',
            name: 'styles.css',
            level: 0,
            position: 1,
            type: ProjectElementDto.TypeEnum.Item,
          },
        ]),
        openFiles: signal<ProjectElementDto[]>([
          {
            id: '1',
            name: 'main.ts',
            level: 0,
            position: 0,
            type: ProjectElementDto.TypeEnum.Item,
          },
          {
            id: '2',
            name: 'styles.css',
            level: 0,
            position: 1,
            type: ProjectElementDto.TypeEnum.Item,
          },
        ]),
      },
    },
  }),
};

export const Error: Story = {
  render: args => ({
    props: {
      ...args,
      projectState: {
        ...new MockProjectStateService(),
        error: signal('Failed to load project'),
      },
    },
  }),
};
