import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  userGuideSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      link: {
        type: 'generated-index',
        description: 'Set up your account and create your first project.',
      },
      items: [
        'getting-started/client-mode',
        'getting-started/account-setup',
        'getting-started/dashboard',
        'getting-started/first-project',
      ],
    },
    {
      type: 'category',
      label: 'Working in Projects',
      collapsed: false,
      link: {
        type: 'generated-index',
        description: 'Navigate the project interface and manage your writing.',
      },
      items: [
        'organizing/project-structure',
        'organizing/documents',
        'organizing/tags',
        'organizing/search',
        'organizing/local-first-design',
      ],
    },
    {
      type: 'category',
      label: 'Writing & Editing',
      collapsed: false,
      link: {
        type: 'generated-index',
        description: 'Master the rich text editor and writing workflow.',
      },
      items: [
        'writing/editor',
        'writing/keyboard-shortcuts',
        'writing/formatting',
      ],
    },
    {
      type: 'category',
      label: 'Worldbuilding',
      collapsed: false,
      link: {
        type: 'generated-index',
        description:
          'Build your story world with structured elements and customizable templates.',
      },
      items: [
        'worldbuilding/elements',
        'worldbuilding/element-references',
        'worldbuilding/relationships',
      ],
    },
    {
      type: 'category',
      label: 'Collaboration',
      collapsed: false,
      link: {
        type: 'generated-index',
        description: 'Work together with co-authors in real-time.',
      },
      items: [
        'collaboration/real-time',
        'collaboration/sharing',
      ],
    },
    {
      type: 'category',
      label: 'Media & Images',
      collapsed: false,
      link: {
        type: 'generated-index',
        description:
          'Manage images, covers, and media assets in your project.',
      },
      items: ['media/library', 'media/covers', 'media/ai-generation'],
    },
    {
      type: 'category',
      label: 'Publishing & Export',
      collapsed: false,
      link: {
        type: 'generated-index',
        description:
          'Export your work in professional formats like EPUB, PDF, and more.',
      },
      items: [
        'publishing/formats',
        'publishing/publish-plans',
        'publishing/customization',
      ],
    },
    {
      type: 'category',
      label: 'Settings',
      collapsed: false,
      link: {
        type: 'generated-index',
        description:
          'Configure your personal preferences and project settings.',
      },
      items: ['settings/user-settings', 'settings/project-settings'],
    },
  ],
};

export default sidebars;
