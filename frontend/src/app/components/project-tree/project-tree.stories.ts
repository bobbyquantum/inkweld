import type { Meta, StoryObj } from '@storybook/angular';
import { ProjectTreeComponent } from './project-tree.component';
import { TREE_DATA } from './TREE_DATA';

const meta: Meta<ProjectTreeComponent> = {
  title: 'Components/ProjectTree',
  component: ProjectTreeComponent,
  tags: ['autodocs'],
  render: (args: ProjectTreeComponent) => ({
    props: {
      ...args,
    },
  }),
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
