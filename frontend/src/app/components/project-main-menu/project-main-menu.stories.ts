import type { Meta, StoryObj } from '@storybook/angular';
import { ProjectMainMenuComponent } from './project-main-menu.component';
import { moduleMetadata } from '@storybook/angular';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

/**
 * The ProjectMainMenuComponent is a reusable menu bar that provides a typical
 * File, Edit, View, Help structure commonly found in desktop applications.
 *
 * It uses Angular Material's MatMenu for dropdown functionality and can be
 * easily customized with different menu items.
 *
 * Usage:
 * <app-project-main-menu [menuItems]="customMenuItems"></app-project-main-menu>
 *
 * Where customMenuItems is an array of MenuItem objects:
 * interface MenuItem {
 *   label: string;
 *   items: string[];
 * }
 */

const meta: Meta<ProjectMainMenuComponent> = {
  title: 'Components/ProjectMainMenu',
  component: ProjectMainMenuComponent,
  decorators: [
    moduleMetadata({
      imports: [MatMenuModule, MatButtonModule, BrowserAnimationsModule],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<ProjectMainMenuComponent>;

export const Default: Story = {
  args: {},
};

export const CustomMenuItems: Story = {
  args: {
    menuItems: [
      {
        label: 'Custom',
        items: ['Item 1', 'Item 2', 'Item 3'],
      },
      {
        label: 'Menu',
        items: ['Option A', 'Option B'],
      },
    ],
  },
};
