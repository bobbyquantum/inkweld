import { type Meta, type StoryObj } from '@storybook/angular';

import { GlassCardComponent } from './glass-card.component';

const meta: Meta<GlassCardComponent> = {
  title: 'Components/Glass Card',
  component: GlassCardComponent,
  tags: ['autodocs'],
  argTypes: {
    icon: {
      control: 'text',
      description: 'Material icon name shown before the title.',
    },
    title: { control: 'text' },
    transparent: { control: 'boolean' },
  },
  render: args => ({
    props: args,
    template: `
      <app-glass-card [icon]="icon" [title]="title" [transparent]="transparent">
        <p>Glass cards sit over a per-surface background so the image, gradient
        or colour behind them still shows through.</p>
      </app-glass-card>
    `,
  }),
};

export default meta;
type Story = StoryObj<GlassCardComponent>;

export const Default: Story = {
  args: {
    title: 'Appearance',
    icon: 'palette',
    transparent: false,
  },
};

export const WithoutHeader: Story = {
  args: {
    transparent: false,
  },
};

export const Transparent: Story = {
  args: {
    title: 'Menu background',
    icon: 'image',
    transparent: true,
  },
};
