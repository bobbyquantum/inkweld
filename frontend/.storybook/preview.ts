import { setCompodocJson } from '@storybook/addon-docs/angular';
import docJson from '../documentation.json';
import { applicationConfig, type Preview } from '@storybook/angular';
import { provideAnimations } from '@angular/platform-browser/animations';
import { themes } from '@storybook/theming';

setCompodocJson(docJson);

const preview: Preview = {
  parameters: {
    darkMode: {
      darkClass: 'dark-theme',
      lightClass: 'light-theme',
      stylePreview: true,
    },
    // docs: {
    //   theme: themes.dark,
    // },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [provideAnimations()],
    }),
  ],
};

export default preview;
