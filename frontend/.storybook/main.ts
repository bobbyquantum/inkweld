import { StorybookConfig } from '@storybook/angular';
import path from 'path';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
  ],
  framework: {
    name: '@storybook/angular',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  staticDirs: [],
  webpackFinal: async config => {
    if (config.module && config.module.rules) {
      // Add rule for SCSS files, including those with query parameters
      config.module.rules.push({
        test: /\.scss(?:\?.*)?$/i, // Adjusted regex to match '.scss' with optional query parameters
        use: ['style-loader', 'css-loader', 'sass-loader'],
        include: path.resolve(__dirname, '../'), // Ensure proper path resolution
      });
      // Add rule for CSS files, including those with query parameters
      config.module.rules.push({
        test: /\.css(?:\?.*)?$/i, // Adjusted regex to match '.css' with optional query parameters
        use: ['style-loader', 'css-loader'],
        include: path.resolve(__dirname, '../'), // Ensure proper path resolution
      });
    }
    return config;
  },
};

export default config;
