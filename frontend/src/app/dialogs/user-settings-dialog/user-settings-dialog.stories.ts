import { BreakpointObserver } from '@angular/cdk/layout';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  applicationConfig,
  Meta,
  moduleMetadata,
  StoryObj,
} from '@storybook/angular';
import { BehaviorSubject, Subject } from 'rxjs';

import { GeneralSettingsComponent } from './tabs/general-settings/general-settings.component';
import { UserSettingsDialogComponent } from './user-settings-dialog.component';
const mockBreakpointObserver = {
  observe: () => new BehaviorSubject({ matches: false }),
};

const mockMobileBreakpointObserver = {
  observe: () => new BehaviorSubject({ matches: true }),
};

const meta: Meta<UserSettingsDialogComponent> = {
  title: 'Dialogs/UserSettingsDialog',
  component: UserSettingsDialogComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        UserSettingsDialogComponent,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatListModule,
        GeneralSettingsComponent,
        MatDialogModule,
      ],
      providers: [
        { provide: BreakpointObserver, useValue: mockBreakpointObserver },
      ],
    }),
    applicationConfig({
      providers: [provideAnimations()],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
This is the UserSettingsDialog component. It allows users to modify their account settings.

To use this component in your Angular application:

1. Import the UserSettingsDialogComponent in your module or component.
2. Inject MatDialog in your component's constructor.
3. Use the MatDialog.open() method to open the dialog:

\`\`\`typescript
this.dialog.open(UserSettingsDialogComponent, {
  width: '400px',
  data: { selectedCategory: 'general' }, // or 'account'
});
\`\`\`

In this Storybook, the component is rendered directly to simulate its appearance within a dialog.
        `,
      },
    },
  },
  render: (args: Partial<UserSettingsDialogComponent>) => ({
    props: {
      ...args,
      isMobile: args.isMobile ?? false,
      destroyed: new Subject<void>(),
      breakpointObserver: args.isMobile
        ? mockMobileBreakpointObserver
        : mockBreakpointObserver,
      selectCategory: (category: 'general' | 'account') => {
        args.selectedCategory = category;
      },
      getAnimationState: () => ({
        value: args.selectedCategory,
        params: {
          enterTransform: '100%',
          leaveTransform: '-100%',
        },
      }),
    },
    template: `
      <div style="width: 100%; height: 100vh; display: flex; justify-content: center; align-items: center; ">
        <div [style.width]="isMobile ? '100%' : '80%'" style="border-radius: 20px; background-color: var(--mdc-dialog-container-color, var(--mat-app-surface, white)); box-shadow: 0 11px 15px -7px rgba(0,0,0,.2), 0 24px 38px 3px rgba(0,0,0,.14), 0 9px 46px 8px rgba(0,0,0,.12); max-width: 600px; height: auto; overflow: auto;">
          <app-user-settings-dialog [selectedCategory]="selectedCategory"></app-user-settings-dialog>
        </div>
      </div>
    `,
  }),
};

export default meta;
type Story = StoryObj<UserSettingsDialogComponent>;

export const General: Story = {
  args: {
    selectedCategory: 'general',
    isMobile: false,
  },
};

export const Account: Story = {
  args: {
    selectedCategory: 'account',
    isMobile: false,
  },
};

export const Mobile: Story = {
  args: {
    selectedCategory: 'general',
    isMobile: true,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};
