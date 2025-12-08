import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';
import apiSidebar from './docs/api/sidebar';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  projectSidebar: [
    'intro',
    'features',
    'installation',
    {
      type: 'category',
      label: 'User Guide',
      items: ['user-guide/projects', 'user-guide/element-references'],
    },
    {
      type: 'category',
      label: 'Hosting',
      items: [
        'hosting/docker',
        'hosting/cloudflare',
        'hosting/ci-cd',
        'hosting/admin-cli',
      ],
    },
    {
      type: 'category',
      label: 'Developer Guide',
      items: ['developer/architecture', 'developer/api', 'getting-started'],
    },
    {
      type: 'category',
      label: 'Troubleshooting',
      items: ['troubleshooting/cookies'],
    },
  ],
  // Auto-generated API documentation sidebar
  apiSidebar: apiSidebar,
};

export default sidebars;
