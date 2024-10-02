import { setCompodocJson } from '@storybook/addon-docs/angular';
import docJson from '../documentation.json';
import { ThemeOption } from '../src/themes/theme.service';
import {
  moduleMetadata,
  applicationConfig,
  type Preview,
} from '@storybook/angular';
import { importProvidersFrom } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule } from '@angular/common/http';

import '!style-loader!css-loader!sass-loader!./../src/themes/theme.scss';

setCompodocJson(docJson);

const applyTheme = (theme: ThemeOption) => {
  const body = document.body;
  body.classList.remove('light-theme', 'dark-theme');
  body.classList.add(theme);
};

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
  decorators: [
    moduleMetadata({
      imports: [BrowserAnimationsModule, HttpClientModule],
    }),
    applicationConfig({
      providers: [
        importProvidersFrom(BrowserAnimationsModule, HttpClientModule),
      ],
    }),
    (Story, context) => {
      const theme = context.globals['theme'] as ThemeOption;
      applyTheme(theme);
      return Story();
    },
  ],
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Global theme for components',
      defaultValue: 'dark-theme' as ThemeOption,
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'light-theme', icon: 'circlehollow', title: 'Light' },
          { value: 'dark-theme', icon: 'circle', title: 'Dark' },
        ],
        showName: true,
      },
    },
  },
};

export default preview;
