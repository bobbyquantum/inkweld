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
      // Safely filter out existing SCSS and CSS rules
      config.module.rules = config.module.rules.filter(
        (rule): rule is webpack.RuleSetRule => {
          return (
            typeof rule !== 'string' &&
            rule !== false &&
            rule !== null &&
            rule !== undefined &&
            !(
              'test' in rule &&
              rule.test instanceof RegExp &&
              (rule.test.test('.scss') || rule.test.test('.css'))
            )
          );
        }
      );

      // Add rule for SCSS files in the 'src' directory
      config.module.rules.push({
        test: /\.scss$/i,
        use: ['style-loader', 'css-loader', 'sass-loader'],
        include: path.resolve(__dirname, '../src'),
      });

      // Add rule for CSS files in the 'src' directory
      config.module.rules.push({
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
        include: path.resolve(__dirname, '../src'),
      });
    }
    return config;
  },
};

export default config;
