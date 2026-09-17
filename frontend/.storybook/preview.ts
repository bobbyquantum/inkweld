import { provideHttpClient } from '@angular/common/http';
import {
  importProvidersFrom,
  provideZonelessChangeDetection,
} from '@angular/core';
import { withThemeByClassName } from '@storybook/addon-themes';
import { applicationConfig, type Preview } from '@storybook/angular';

import { translocoTestProvider } from '../src/testing/transloco-test-provider';

const preview: Preview = {
  decorators: [
    // Mirrors the app's root providers (src/app/app.config.ts) so components
    // that inject HttpClient, Transloco or any `providedIn: 'root'` service
    // render the same way they do in the app. Translations come from the
    // statically bundled `en` catalogue rather than the HTTP loader, so
    // stories render text immediately and without a backend.
    applicationConfig({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        importProvidersFrom(translocoTestProvider()),
      ],
    }),
    // ThemeService swaps these classes on <body> at runtime; the toolbar
    // switcher does the same thing so stories can be checked in both themes.
    withThemeByClassName({
      themes: { light: 'light-theme', dark: 'dark-theme' },
      defaultTheme: 'light',
      parentSelector: 'body',
    }),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
