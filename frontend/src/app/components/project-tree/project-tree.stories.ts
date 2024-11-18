import type { Meta, StoryObj } from '@storybook/angular';

import { ProjectElement } from './project-element';
import { ProjectTreeComponent } from './project-tree.component';
import { FILE_ONLY_DATA, SINGLE_FOLDER_DATA, TREE_DATA } from './TREE_DATA';

interface ProjectTreeComponentInputs {
  /**
   * The data for the tree structure.
   */
  treeData: ProjectElement[];
}

const meta: Meta<ProjectTreeComponent> = {
  title: 'Components/ProjectTree',
  component: ProjectTreeComponent,
  tags: ['autodocs'],
  render: (args: ProjectTreeComponentInputs) => ({
    props: {
      ...args,
    },
  }),
  argTypes: {
    treeData: {
      name: 'Tree Data',
      description: 'The data for the tree structure.',
      control: 'object',
      table: {
        type: { summary: 'ProjectElement[]' },
        defaultValue: { summary: '[]' },
      },
    },
  },
  parameters: {
    docs: {
      description: {
        component: 'Component for displaying and managing the project tree.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<ProjectTreeComponent>;

export const Default: Story = {
  args: {
    treeData: TREE_DATA,
  },
};

export const EmptyTree: Story = {
  args: {
    treeData: [],
  },
};

export const SingleNode: Story = {
  args: {
    treeData: [TREE_DATA[0]],
  },
};

export const FoldersOnly: Story = {
  args: {
    treeData: TREE_DATA.filter(node => node.type === 'folder'),
  },
};

export const FilesOnly: Story = {
  args: {
    treeData: FILE_ONLY_DATA,
  },
};

export const SingleFolder: Story = {
  args: {
    treeData: SINGLE_FOLDER_DATA,
  },
};
