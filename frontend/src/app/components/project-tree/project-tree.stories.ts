import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { MatTreeModule } from '@angular/material/tree';
import { MatIconModule } from '@angular/material/icon';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { provideAnimations } from '@angular/platform-browser/animations';
import { ProjectTreeComponent } from './project-tree.component';

const meta: Meta<ProjectTreeComponent> = {
  title: 'Components/ProjectTree',
  component: ProjectTreeComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [MatTreeModule, MatIconModule, DragDropModule],
      providers: [provideAnimations()],
    }),
  ],
};

export default meta;
type Story = StoryObj<ProjectTreeComponent>;

export const Default: Story = {};
