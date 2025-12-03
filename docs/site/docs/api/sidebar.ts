import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebar: SidebarsConfig = {
  apisidebar: [
    {
      type: 'doc',
      id: 'api/inkweld-api',
    },
    {
      type: 'category',
      label: 'Authentication',
      items: [
        {
          type: 'doc',
          id: 'api/register-user',
          label: 'registerUser',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/login',
          label: 'login',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/logout',
          label: 'logout',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/list-o-auth-providers',
          label: 'listOAuthProviders',
          className: 'api-method get',
        },
      ],
    },
    {
      type: 'category',
      label: 'Users',
      items: [
        {
          type: 'doc',
          id: 'api/get-current-user',
          label: 'getCurrentUser',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/list-users',
          label: 'listUsers',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/search-users',
          label: 'searchUsers',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/check-username-availability',
          label: 'checkUsernameAvailability',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-user-avatar',
          label: 'getUserAvatar',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/upload-user-avatar',
          label: 'uploadUserAvatar',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/delete-user-avatar',
          label: 'deleteUserAvatar',
          className: 'api-method post',
        },
      ],
    },
    {
      type: 'category',
      label: 'Projects',
      items: [
        {
          type: 'doc',
          id: 'api/list-user-projects',
          label: 'listUserProjects',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/create-project',
          label: 'createProject',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/get-project',
          label: 'getProject',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/update-project',
          label: 'updateProject',
          className: 'api-method put',
        },
        {
          type: 'doc',
          id: 'api/delete-project',
          label: 'deleteProject',
          className: 'api-method delete',
        },
      ],
    },
    {
      type: 'category',
      label: 'Documents',
      items: [
        {
          type: 'doc',
          id: 'api/list-project-documents',
          label: 'listProjectDocuments',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-project-document',
          label: 'getProjectDocument',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/render-document-as-html',
          label: 'renderDocumentAsHtml',
          className: 'api-method get',
        },
      ],
    },
    {
      type: 'category',
      label: 'Elements',
      items: [
        {
          type: 'doc',
          id: 'api/list-project-elements',
          label: 'listProjectElements',
          className: 'api-method get',
        },
      ],
    },
    {
      type: 'category',
      label: 'Files',
      items: [
        {
          type: 'doc',
          id: 'api/list-project-files',
          label: 'listProjectFiles',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/upload-project-file',
          label: 'uploadProjectFile',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/download-project-file',
          label: 'downloadProjectFile',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/delete-project-file',
          label: 'deleteProjectFile',
          className: 'api-method delete',
        },
      ],
    },
    {
      type: 'category',
      label: 'Images',
      items: [
        {
          type: 'doc',
          id: 'api/upload-project-cover',
          label: 'uploadProjectCover',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/get-project-cover',
          label: 'getProjectCover',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/delete-project-cover',
          label: 'deleteProjectCover',
          className: 'api-method delete',
        },
      ],
    },
    {
      type: 'category',
      label: 'Snapshots',
      items: [
        {
          type: 'doc',
          id: 'api/list-project-snapshots',
          label: 'listProjectSnapshots',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/create-project-snapshot',
          label: 'createProjectSnapshot',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/get-project-snapshot',
          label: 'getProjectSnapshot',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/delete-project-snapshot',
          label: 'deleteProjectSnapshot',
          className: 'api-method delete',
        },
        {
          type: 'doc',
          id: 'api/restore-project-snapshot',
          label: 'restoreProjectSnapshot',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/preview-project-snapshot',
          label: 'previewProjectSnapshot',
          className: 'api-method get',
        },
      ],
    },
    {
      type: 'category',
      label: 'Health',
      items: [
        {
          type: 'doc',
          id: 'api/check-health',
          label: 'checkHealth',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/check-readiness',
          label: 'checkReadiness',
          className: 'api-method get',
        },
      ],
    },
    {
      type: 'category',
      label: 'Configuration',
      items: [
        {
          type: 'doc',
          id: 'api/get-app-configuration',
          label: 'getAppConfiguration',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-system-features',
          label: 'getSystemFeatures',
          className: 'api-method get',
        },
      ],
    },
    {
      type: 'category',
      label: 'Security',
      items: [
        {
          type: 'doc',
          id: 'api/get-csrf-token',
          label: 'getCSRFToken',
          className: 'api-method get',
        },
      ],
    },
    {
      type: 'category',
      label: 'Linting',
      items: [
        {
          type: 'doc',
          id: 'api/get-lint-status',
          label: 'getLintStatus',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/lint-paragraph',
          label: 'lintParagraph',
          className: 'api-method post',
        },
      ],
    },
    {
      type: 'category',
      label: 'AI Image Generation',
      items: [
        {
          type: 'doc',
          id: 'api/generate-ai-image',
          label: 'generateAIImage',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/get-ai-image-status',
          label: 'getAIImageStatus',
          className: 'api-method get',
        },
      ],
    },
    {
      type: 'category',
      label: 'MCP',
      items: [
        {
          type: 'doc',
          id: 'api/get-mcp-event-stream',
          label: 'getMCPEventStream',
          className: 'api-method get',
        },
      ],
    },
  ],
};

export default sidebar.apisidebar;
