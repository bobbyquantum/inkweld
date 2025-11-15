import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebar: SidebarsConfig = {
  apisidebar: [
    {
      type: "doc",
      id: "api/inkweld-api",
    },
    {
      type: "category",
      label: "Authentication",
      items: [
        {
          type: "doc",
          id: "api/post-api-v-1-auth-register",
          label: "postApiV1AuthRegister",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/post-api-v-1-auth-login",
          label: "postApiV1AuthLogin",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/post-api-v-1-auth-logout",
          label: "postApiV1AuthLogout",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-api-v-1-auth-providers",
          label: "getApiV1AuthProviders",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Users",
      items: [
        {
          type: "doc",
          id: "api/get-api-v-1-users-me",
          label: "getApiV1UsersMe",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/get-api-v-1-users",
          label: "getApiV1Users",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/get-api-v-1-users-search",
          label: "getApiV1UsersSearch",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/post-api-v-1-users-register",
          label: "postApiV1UsersRegister",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-api-v-1-users-check-username",
          label: "getApiV1UsersCheck-username",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/get-api-v-1-users-username-avatar",
          label: "getApiV1Users:usernameAvatar",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/post-api-v-1-users-avatar",
          label: "postApiV1UsersAvatar",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/post-api-v-1-users-avatar-delete",
          label: "postApiV1UsersAvatarDelete",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "Projects",
      items: [
        {
          type: "doc",
          id: "api/get-api-v-1-projects",
          label: "getApiV1Projects",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/post-api-v-1-projects",
          label: "postApiV1Projects",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-api-v-1-projects-username-slug",
          label: "getApiV1Projects:username:slug",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/put-api-v-1-projects-username-slug",
          label: "putApiV1Projects:username:slug",
          className: "api-method put",
        },
        {
          type: "doc",
          id: "api/delete-api-v-1-projects-username-slug",
          label: "deleteApiV1Projects:username:slug",
          className: "api-method delete",
        },
      ],
    },
    {
      type: "category",
      label: "Documents",
      items: [
        {
          type: "doc",
          id: "api/get-api-v-1-projects-username-slug-docs",
          label: "getApiV1Projects:username:slugDocs",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/get-api-v-1-projects-username-slug-docs-doc-id",
          label: "getApiV1Projects:username:slugDocs:docId",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/get-api-v-1-projects-username-slug-docs-doc-id-html",
          label: "getApiV1Projects:username:slugDocs:docIdHtml",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Elements",
      items: [
        {
          type: "doc",
          id: "api/get-api-v-1-projects-username-slug-elements",
          label: "getApiV1Projects:username:slugElements",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Files",
      items: [
        {
          type: "doc",
          id: "api/get-api-v-1-projects-username-slug-files",
          label: "getApiV1Projects:username:slugFiles",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/post-api-v-1-projects-username-slug-files",
          label: "postApiV1Projects:username:slugFiles",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-api-v-1-projects-username-slug-files-stored-name",
          label: "getApiV1Projects:username:slugFiles:storedName",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/delete-api-v-1-projects-username-slug-files-stored-name",
          label: "deleteApiV1Projects:username:slugFiles:storedName",
          className: "api-method delete",
        },
      ],
    },
    {
      type: "category",
      label: "Export",
      items: [
        {
          type: "doc",
          id: "api/post-api-v-1-projects-username-slug-epub",
          label: "postApiV1Projects:username:slugEpub",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "Images",
      items: [
        {
          type: "doc",
          id: "api/post-api-v-1-projects-username-slug-cover",
          label: "postApiV1Projects:username:slugCover",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-api-v-1-projects-username-slug-cover",
          label: "getApiV1Projects:username:slugCover",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/delete-api-v-1-projects-username-slug-cover",
          label: "deleteApiV1Projects:username:slugCover",
          className: "api-method delete",
        },
      ],
    },
    {
      type: "category",
      label: "Snapshots",
      items: [
        {
          type: "doc",
          id: "api/get-api-v-1-snapshots-username-slug",
          label: "getApiV1Snapshots:username:slug",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/post-api-v-1-snapshots-username-slug",
          label: "postApiV1Snapshots:username:slug",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-api-v-1-snapshots-username-slug-snapshot-id",
          label: "getApiV1Snapshots:username:slug:snapshotId",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/delete-api-v-1-snapshots-username-slug-snapshot-id",
          label: "deleteApiV1Snapshots:username:slug:snapshotId",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api/post-api-v-1-snapshots-username-slug-snapshot-id-restore",
          label: "postApiV1Snapshots:username:slug:snapshotIdRestore",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-api-v-1-snapshots-username-slug-snapshot-id-preview",
          label: "getApiV1Snapshots:username:slug:snapshotIdPreview",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Health",
      items: [
        {
          type: "doc",
          id: "api/get-api-v-1-health",
          label: "getApiV1Health",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/get-api-v-1-health-ready",
          label: "getApiV1HealthReady",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Configuration",
      items: [
        {
          type: "doc",
          id: "api/get-api-v-1-config",
          label: "getApiV1Config",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/get-api-v-1-config-features",
          label: "getApiV1ConfigFeatures",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Security",
      items: [
        {
          type: "doc",
          id: "api/get-api-v-1-csrf-token",
          label: "getApiV1CsrfToken",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Linting",
      items: [
        {
          type: "doc",
          id: "api/get-api-v-1-ai-lint-status",
          label: "getApiV1AiLintStatus",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/post-api-v-1-ai-lint",
          label: "postApiV1AiLint",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "AI Image Generation",
      items: [
        {
          type: "doc",
          id: "api/post-api-v-1-ai-image-generate",
          label: "postApiV1AiImageGenerate",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-api-v-1-ai-image-status",
          label: "getApiV1AiImageStatus",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "MCP",
      items: [
        {
          type: "doc",
          id: "api/get-api-v-1-ai-mcp-sse",
          label: "getApiV1AiMcpSse",
          className: "api-method get",
        },
      ],
    },
  ],
};

export default sidebar.apisidebar;
