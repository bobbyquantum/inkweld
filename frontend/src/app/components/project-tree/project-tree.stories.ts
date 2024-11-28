import { provideHttpClient } from '@angular/common/http';
import { computed, Signal } from '@angular/core';
import { ProjectTreeService } from '@services/project-tree.service';
import {
  applicationConfig,
  Meta,
  moduleMetadata,
  StoryObj,
} from '@storybook/angular';
import { ProjectElementDto } from 'worm-api-client';

import { ProjectTreeComponent } from './project-tree.component';
import { FILE_ONLY_DATA, SINGLE_FOLDER_DATA, TREE_DATA } from './TREE_DATA';

// Create a mock service that implements just what we need for the stories
class MockProjectTreeService implements Partial<ProjectTreeService> {
  mockElements: ProjectElementDto[] = [];

  readonly elements: Signal<ProjectElementDto[]> = computed(
    () => this.mockElements
  );
  readonly isLoading: Signal<boolean> = computed(() => false);
  readonly isSaving: Signal<boolean> = computed(() => false);
  readonly error: Signal<string | undefined> = computed(() => undefined);

  constructor(mockData: ProjectElementDto[]) {
    this.updateElements(mockData);
  }

  updateElements(elements: ProjectElementDto[]): void {
    this.mockElements = elements;
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
    moduleMetadata({
      providers: [
        {
          provide: ProjectTreeService,
          useValue: new MockProjectTreeService([]),
        },
      ],
    }),
    applicationConfig({
      providers: [provideHttpClient()],
    }),
  ],
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

// Helper function to create story with service
const createStory = (data: ProjectElementDto[]): Story => ({
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: ProjectTreeService,
          useValue: new MockProjectTreeService(data),
        },
      ],
    }),
  ],
  args: {
    initialData: data,
  },
});

export const Default: Story = createStory(TREE_DATA.map(toDto));

export const EmptyTree: Story = createStory([]);

export const SingleNode: Story = createStory([toDto(TREE_DATA[0])]);

export const FoldersOnly: Story = createStory(
  TREE_DATA.filter(node => node.type === 'FOLDER').map(toDto)
);

export const FilesOnly: Story = createStory(FILE_ONLY_DATA.map(toDto));

export const SingleFolder: Story = createStory(SINGLE_FOLDER_DATA.map(toDto));
