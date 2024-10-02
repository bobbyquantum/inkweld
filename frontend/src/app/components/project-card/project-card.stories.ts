import type { Meta, StoryObj } from '@storybook/angular';
import { ProjectCardComponent } from './project-card.component';

const meta: Meta<ProjectCardComponent> = {
  title: 'Components/ProjectCard',
  component: ProjectCardComponent,
  tags: ['autodocs'],
  render: (args: ProjectCardComponent) => ({
    props: {
      ...args,
    },
  }),
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
