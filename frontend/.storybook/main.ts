import type { StorybookConfig } from '@storybook/angular';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.ts'],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
  ],
  framework: {
    name: '@storybook/angular',
    options: {},
  },
  // Global styles, SCSS include paths and static assets (fonts, i18n JSON,
  // images) are inherited from the `inkweld-frontend:build:development` target
  // referenced by the storybook builders in angular.json.
};

export default config;
