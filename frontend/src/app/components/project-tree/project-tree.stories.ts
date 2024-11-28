import { HttpClient } from '@angular/common/http';
import { ProjectTreeService } from '@services/project-tree.service';
import type { Meta, StoryObj } from '@storybook/angular';
import { ProjectElementDto } from 'worm-api-client';

import { ProjectTreeComponent } from './project-tree.component';
import { FILE_ONLY_DATA, SINGLE_FOLDER_DATA, TREE_DATA } from './TREE_DATA';

// Create a mock service that provides the test data
class MockProjectTreeService extends ProjectTreeService {
  constructor(mockData: ProjectElementDto[]) {
    super();
    this.updateElements(mockData);
  }
}

// Convert ProjectElement to ProjectElementDto
function toDto(element: {
  id: string;
  name: string;
  type: 'FOLDER' | 'ITEM';
  level: number;
  position: number;
}): ProjectElementDto {
  return {
    id: element.id,
    name: element.name,
    type: element.type,
    level: element.level,
    position: element.position,
  };
}

// Interface for story args
interface TreeStoryArgs {
  initialData: ProjectElementDto[];
}

const meta: Meta<ProjectTreeComponent & TreeStoryArgs> = {
  title: 'Components/ProjectTree',
  component: ProjectTreeComponent,
  tags: ['autodocs'],
  decorators: [
    (Story, { args }) => ({
      moduleMetadata: {
        providers: [
          {
            provide: ProjectTreeService,
            useFactory: () => new MockProjectTreeService(args.initialData),
          },
          { provide: HttpClient, useValue: {} },
        ],
      },
      template: '<story />',
    }),
  ],
  render: () => ({}),
  parameters: {
    docs: {
      description: {
        component: 'Component for displaying and managing the project tree.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<ProjectTreeComponent & TreeStoryArgs>;

export const Default: Story = {
  args: {
    initialData: TREE_DATA.map(toDto),
  },
};

export const EmptyTree: Story = {
  args: {
    initialData: [],
  },
};

export const SingleNode: Story = {
  args: {
    initialData: [toDto(TREE_DATA[0])],
  },
};

export const FoldersOnly: Story = {
  args: {
    initialData: TREE_DATA.filter(node => node.type === 'FOLDER').map(toDto),
  },
};

export const FilesOnly: Story = {
  args: {
    initialData: FILE_ONLY_DATA.map(toDto),
  },
};

export const SingleFolder: Story = {
  args: {
    initialData: SINGLE_FOLDER_DATA.map(toDto),
  },
};
