import { type Meta, type StoryObj } from '@storybook/angular';

import { ThemeToggleComponent } from './theme-toggle.component';

const DESCRIPTION = `
Exercises the shared preview providers: Angular Material, Transloco
translations from the bundled \`en\` catalogue, and a \`providedIn: 'root'\`
service.

The buttons drive the real \`ThemeService\`, so clicking them writes to
localStorage and swaps the theme class on \`<body>\` — the same thing the
toolbar's theme switcher does.
`;

const meta: Meta<ThemeToggleComponent> = {
  title: 'Components/Theme Toggle',
  component: ThemeToggleComponent,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: DESCRIPTION } },
  },
};

export default meta;
type Story = StoryObj<ThemeToggleComponent>;

export const Default: Story = {};
