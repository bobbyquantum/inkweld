import { provideHttpClient } from '@angular/common/http';
import { signal, WritableSignal } from '@angular/core';
import { ProjectStateService } from '@services/project-state.service';
import {
  applicationConfig,
  Meta,
  moduleMetadata,
  StoryObj,
} from '@storybook/angular';
import { ProjectElementDto } from '@worm/index';

import { ProjectElement } from './project-element';
import { ProjectTreeComponent } from './project-tree.component';
import { FILE_ONLY_DATA, SINGLE_FOLDER_DATA, TREE_DATA } from './TREE_DATA';

// Create a mock service that implements just what we need for the stories
class MockProjectTreeService implements Partial<ProjectStateService> {
  mockElements: WritableSignal<ProjectElementDto[]> = signal([]);
  mockLoading: WritableSignal<boolean> = signal(false);
  mockError: WritableSignal<string | undefined> = signal(undefined);

  readonly elements = this.mockElements;
  readonly isLoading = this.mockLoading;
  readonly isSaving: WritableSignal<boolean> = signal(false);
  readonly error = this.mockError;

  constructor(
    mockData: ProjectElementDto[],
    loading = false,
    errorMessage?: string
  ) {
    this.updateElements(mockData);
    this.mockLoading.set(loading);
    if (errorMessage) {
      this.mockError.set(errorMessage);
    }
  }

  updateElements(elements: ProjectElementDto[]): void {
    this.mockElements.set(elements);
  }
}

// Interface for story args
interface TreeStoryArgs {
  initialData: ProjectElementDto[];
  loading?: boolean;
}

const meta: Meta<ProjectTreeComponent & TreeStoryArgs> = {
  title: 'Components/ProjectTree',
  component: ProjectTreeComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: ProjectStateService,
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
const createStory = (
  data: ProjectElementDto[],
  loading = false,
  errorMessage?: string
): Story => ({
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: ProjectStateService,
          useValue: new MockProjectTreeService(data, loading, errorMessage),
        },
      ],
    }),
  ],
  args: {
    initialData: data,
    loading,
  },
});

// Convert mock data to DTOs, ensuring IDs are strings
const convertData = (data: ProjectElement[]): ProjectElementDto[] =>
  data.map(element => ({
    ...element,
    id: element.id ?? '',
  }));

export const Default: Story = createStory(convertData(TREE_DATA));

export const EmptyTree: Story = createStory([]);

export const SingleNode: Story = createStory(convertData([TREE_DATA[0]]));

export const FoldersOnly: Story = createStory(
  convertData(TREE_DATA.filter(node => node.type === 'FOLDER'))
);

export const FilesOnly: Story = createStory(convertData(FILE_ONLY_DATA));

export const SingleFolder: Story = createStory(convertData(SINGLE_FOLDER_DATA));

export const Loading: Story = createStory(convertData(TREE_DATA), true);

export const LoadingEmpty: Story = createStory([], true);

export const Error: Story = createStory(
  convertData(TREE_DATA),
  false,
  'Failed to load project elements'
);

export const ErrorEmpty: Story = createStory(
  [],
  false,
  'Failed to load project elements'
);
