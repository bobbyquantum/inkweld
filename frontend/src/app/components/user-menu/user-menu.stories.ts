import { provideHttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { UserSettingsService } from '@services/user-settings.service';
import {
  applicationConfig,
  Meta,
  moduleMetadata,
  StoryObj,
} from '@storybook/angular';

import { UserMenuComponent } from './user-menu.component';

const meta: Meta<UserMenuComponent> = {
  title: 'Components/UserMenu',
  component: UserMenuComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        MatButtonModule,
        MatMenuModule,
        MatIconModule,
        MatDividerModule,
      ],
      providers: [
        provideAnimations(),
        {
          provide: UserSettingsService,
          useValue: {
            openSettingsDialog: () => {
              console.log('Open settings dialog');
            },
            openFileDialog: () => {
              console.log('Open file dialog');
            },
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
type Story = StoryObj<UserMenuComponent>;

export const LoggedIn: Story = {
  args: {
    user: {
      username: 'testuser',
      name: 'Test User',
      avatarImageUrl: '/static/media/src/stories/assets/context.png',
    },
  },
};

export const LoggedOut: Story = {
  args: {
    user: undefined,
  },
};
