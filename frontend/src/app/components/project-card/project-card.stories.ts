import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { provideAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { of } from 'rxjs';

import { ProjectCardComponent } from './project-card.component';

const meta: Meta<ProjectCardComponent> = {
  title: 'Components/ProjectCard',
  component: ProjectCardComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [MatCardModule, MatButtonModule, RouterTestingModule],
      providers: [
        provideAnimations(),
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ id: 'test-id' }),
          },
        },
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<ProjectCardComponent>;

export const Default: Story = {
  args: {
    project: {
      id: 1,
      title: 'Sample Project',
      slug: 'sample-project',
      description: 'This is a sample project description.',
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    },
  },
};

export const LongDescription: Story = {
  args: {
    project: {
      id: 2,
      title: 'Project with Long Title',
      slug: 'project-with-long-title',
      description:
        "This is a very long project description that will test how the component handles overflow. It should wrap or truncate depending on the component's design.",
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    },
  },
};
