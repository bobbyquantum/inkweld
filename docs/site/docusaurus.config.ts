import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import type * as OpenApiPlugin from 'docusaurus-plugin-openapi-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Inkweld Docs',
  tagline: 'Collaborative writing, explained.',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://preview.inkweld.org',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'bobbyquantum', // Usually your GitHub org/user name.
  projectName: 'inkweld', // Usually your repo name.

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/bobbyquantum/inkweld/edit/main/docs/site/',
          docItemComponent: '@theme/ApiItem', // Derived from docusaurus-theme-openapi-docs
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'user-guide',
        path: 'docs-user-guide',
        routeBasePath: 'user-guide',
        sidebarPath: './sidebars-user-guide.ts',
        editUrl:
          'https://github.com/bobbyquantum/inkweld/edit/main/docs/site/',
      },
    ],
    [
      'docusaurus-plugin-openapi-docs',
      {
        id: 'api',
        docsPluginId: 'classic',
        config: {
          inkweld: {
            specPath: 'static/openapi.json',
            outputDir: 'docs/api',
            sidebarOptions: {
              groupPathsBy: 'tag',
              categoryLinkSource: 'tag',
            },
          } satisfies OpenApiPlugin.Options,
        },
      },
    ],
  ],

  themes: ['docusaurus-theme-openapi-docs', '@docusaurus/theme-mermaid'],

  // Enable Mermaid diagrams
  markdown: {
    mermaid: true,
  },

  themeConfig: {
    // Mermaid theme configuration
    mermaid: {
      theme: { light: 'default', dark: 'forest' },
    },
    // Inkweld social card
    image: 'img/editor-desktop.png',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Inkweld',
      logo: {
        alt: 'Inkweld Logo',
        src: 'img/logo.png',
      },
      items: [
        {
          to: '/features',
          position: 'left',
          label: 'Features',
        },
        {
          type: 'docSidebar',
          sidebarId: 'projectSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/user-guide/',
          position: 'left',
          label: 'User Guide',
          activeBaseRegex: '/user-guide/',
        },
        {
          type: 'docSidebar',
          sidebarId: 'apiSidebar',
          position: 'left',
          label: 'API',
        },
        {
          href: 'https://github.com/bobbyquantum/inkweld',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Features',
              to: '/features',
            },
            {
              label: 'Installation',
              to: '/docs/installation',
            },
            {
              label: 'Configuration',
              to: '/docs/configuration',
            },
            {
              label: 'User Guide',
              to: '/user-guide/',
            },
          ],
        },
        {
          title: 'Installation',
          items: [
            {
              label: 'Docker',
              to: '/docs/installation/docker',
            },
            {
              label: 'Cloudflare Workers',
              to: '/docs/installation/cloudflare',
            },
            {
              label: 'Native Binary',
              to: '/docs/installation/native-bun',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Discussions',
              href: 'https://github.com/bobbyquantum/inkweld/discussions',
            },
            {
              label: 'Issues',
              href: 'https://github.com/bobbyquantum/inkweld/issues',
            },
            {
              label: 'API Reference',
              to: '/api',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/bobbyquantum/inkweld',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Inkweld.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
