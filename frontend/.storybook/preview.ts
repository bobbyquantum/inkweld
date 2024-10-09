import { setCompodocJson } from '@storybook/addon-docs/angular';
import docJson from '../documentation.json';
import { applicationConfig, type Preview } from '@storybook/angular';
import { provideAnimations } from '@angular/platform-browser/animations';
import { themes } from '@storybook/theming';
import { addons } from '@storybook/preview-api';
import { DARK_MODE_EVENT_NAME } from 'storybook-dark-mode';
setCompodocJson(docJson);

const preview: Preview = {
  parameters: {
    darkMode: {
      darkClass: 'dark-theme',
      lightClass: 'light-theme',
      stylePreview: true,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    docs: {
      theme:
        localStorage.getItem('theme') === 'dark' ? themes.dark : themes.light,
    },
  },
  decorators: [
    applicationConfig({
      providers: [provideAnimations()],
    }),
  ],
};

addons.getChannel().on(DARK_MODE_EVENT_NAME, (isDark: boolean) => {
  console.log('Dark mode is', isDark ? 'enabled' : 'disabled');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

export default preview;
