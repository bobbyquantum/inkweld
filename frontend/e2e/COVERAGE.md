# E2E Test Coverage Matrix

This document tracks which pages, features, and routes have e2e test coverage across different test suites.

## Coverage by Route/Page

| Route | Page | Local Tests | Online Tests | Screenshots | Status |
|-------|------|:-----------:|:------------:|:-----------:|--------|
| `/` | Home/Bookshelf | `projects.spec.ts` | `projects.spec.ts` | `pwa-screenshots` | Covered |
| `/setup` | Setup Wizard | `launch.spec.ts` | `launch.spec.ts` | `pwa-screenshots`, `setup-screenshots` | Covered |
| `/about` | About Page | `about.spec.ts` | `about.spec.ts` | `about-screenshots` | Covered |
| `/about/changelog` | Changelog | - | `about.spec.ts` | - | Partial |
| `/create-project` | Create Project | `projects.spec.ts` | `projects.spec.ts` | `pwa-screenshots` | Covered |
| `/settings` | Account Settings | - | `account-settings.spec.ts` | - | Partial |
| `/admin` | Admin Dashboard | - | `admin.spec.ts` | `admin-ai-screenshots`, `admin-kill-switch-screenshots` | Covered |
| `/admin/ai-providers` | AI Providers | - | `admin.spec.ts` | `admin-ai-screenshots` | Partial |
| `/:user/:slug` | Project Home | `projects.spec.ts` | `projects.spec.ts` | `pwa-screenshots` | Covered |
| `/:user/:slug/document/:id` | Document Editor | `element-ref.spec.ts`, `find-in-document.spec.ts`, `image-insert.spec.ts` | - | `pwa-screenshots`, `element-ref-screenshots` | Covered |
| `/:user/:slug/folder/:id` | Folder View | `folder-operations.spec.ts` | - | `pwa-screenshots` | Partial |
| `/:user/:slug/documents-list` | Documents List | `documents-list.spec.ts` | - | `documents-list-screenshots` | Covered |
| `/:user/:slug/media` | Media Library | `media-tab.spec.ts`, `media-storage.spec.ts` | `media-storage.spec.ts` | `pwa-screenshots` | Covered |
| `/:user/:slug/settings` | Project Settings | - | `relationships-tab.spec.ts` | `tags-screenshots`, `templates-tab-screenshots`, `relationships-tab-screenshots`, `project-rename-screenshots` | Covered |
| `/:user/:slug/worldbuilding/:id` | Worldbuilding | `worldbuilding.spec.ts` | - | - | Partial |
| `/:user/:slug/publish-plan/:id` | Publish Plan | `publish.spec.ts` | `publish.spec.ts` | - | Partial |
| `/messages` | Messages | - | - | - | Not Covered |
| `/approval-pending` | Approval Pending | - | - | - | Not Covered |
| `/reset` | Reset Data | - | - | - | Not Covered |
| `/:username` | User Profile | - | - | - | Not Covered |
| `/oauth/authorize` | OAuth Consent | - | `oauth-mcp.spec.ts` | - | Partial |
| `/unavailable` | Service Unavailable | - | `server-unavailable.spec.ts` | - | Partial |
| `/*` (404) | Not Found | `not-found.spec.ts` | - | - | Partial |

## Coverage by Feature Area

| Feature | Local Tests | Online Tests | Screenshots | Notes |
|---------|:-----------:|:------------:|:-----------:|-------|
| **Authentication** | | | | |
| Login | - | `auth/login.spec.ts` | - | Online only |
| Registration | - | `auth/registration.spec.ts` | - | Online only |
| OAuth | - | `auth/oauth.spec.ts`, `oauth-mcp.spec.ts` | - | Online only |
| **Projects** | | | | |
| Create | `projects.spec.ts` | `projects.spec.ts` | `pwa-screenshots` | |
| List/Browse | `projects.spec.ts` | `projects.spec.ts` | `pwa-screenshots` | |
| Open/Navigate | `projects.spec.ts` | `projects.spec.ts` | - | |
| Import/Export | `project-import-export.spec.ts` | - | - | Local only |
| Rename | - | - | `project-rename-screenshots` | Screenshot only |
| Switching | - | `project-switching.spec.ts` | - | Online only |
| **Documents** | | | | |
| List View | `documents-list.spec.ts` | - | `documents-list-screenshots` | |
| Editor | `element-ref.spec.ts`, `find-in-document.spec.ts` | - | `pwa-screenshots` | |
| Image Insert | `image-insert.spec.ts` | - | - | |
| Snapshots | `snapshot.spec.ts` | - | - | |
| **Folders** | | | | |
| Operations | `folder-operations.spec.ts` | - | `pwa-screenshots` | |
| **Worldbuilding** | | | | |
| Elements | `worldbuilding.spec.ts` | - | - | |
| Element Refs | `element-ref.spec.ts` | - | `element-ref-screenshots` | |
| **Media** | | | | |
| Storage | `media-storage.spec.ts` | `media-storage.spec.ts` | - | |
| Library Tab | `media-tab.spec.ts` | - | `pwa-screenshots` | |
| **Publishing** | | | | |
| Publish Plan | `publish.spec.ts` | `publish.spec.ts` | - | |
| **Settings** | | | | |
| Tags | - | - | `tags-screenshots` | Screenshot only |
| Templates | - | - | `templates-tab-screenshots` | Screenshot only |
| Relationships | - | `relationships-tab.spec.ts` | `relationships-tab-screenshots` | |
| Account Settings | - | `account-settings.spec.ts` | - | |
| **Admin** | | | | |
| Dashboard | - | `admin.spec.ts` | - | |
| AI Settings | - | - | `admin-ai-screenshots` | Screenshot only |
| Kill Switch | - | - | `admin-kill-switch-screenshots` | Screenshot only |
| Announcements | - | `announcements.spec.ts` | - | |
| **Navigation** | | | | |
| Quick Open | `quick-open.spec.ts` | - | `quick-open-screenshots` | |
| About Page | `about.spec.ts` | `about.spec.ts` | `about-screenshots` | |
| 404 Page | `not-found.spec.ts` | - | - | |
| Find/Replace | `find-in-document.spec.ts` | - | - | |
| **Infrastructure** | | | | |
| Migration | - | `migration.spec.ts`, `migration-simple.spec.ts` | - | Online only |
| Server Unavailable | - | `server-unavailable.spec.ts` | - | Online only |
| Error Handling | - | `error-handling.spec.ts` | - | Online only |
| Template Import | `template-import.spec.ts` | - | - | Local only |
| **MCP** | | | | |
| Auth | - | - | - | `mcp/mcp-auth.spec.ts` |
| Discovery | - | - | - | `mcp/mcp-discovery.spec.ts` |
| Resources | - | - | - | `mcp/mcp-resources.spec.ts` |
| Mutation Tools | - | - | - | `mcp/mcp-mutation-tools.spec.ts` |
| Search Tools | - | - | - | `mcp/mcp-search-tools.spec.ts` |

## Known Gaps

The following areas have been identified as having incomplete or no e2e coverage:

### Not Covered (No Tests)
- **Messages page** (`/messages`) - No tests for the notification/messages center
- **Approval Pending page** (`/approval-pending`) - No tests for the user approval flow
- **Reset Data page** (`/reset`) - No tests for the data reset functionality
- **User Profile page** (`/:username`) - No tests for public user profiles

### Screenshot-Only Coverage
These features have screenshot tests but no functional e2e tests:
- **Project Rename** - Only captured in `project-rename-screenshots.spec.ts`
- **Tags Management** - Only captured in `tags-screenshots.spec.ts`
- **Templates Management** - Only captured in `templates-tab-screenshots.spec.ts`
- **Admin AI Settings** - Only captured in `admin-ai-screenshots.spec.ts`
- **Admin Kill Switch** - Only captured in `admin-kill-switch-screenshots.spec.ts`

### Partial Coverage
- **Account Settings** - Basic navigation tested, but OAuth session management (revoke, modify permissions) not deeply tested
- **Changelog** - Navigation tested but content rendering not verified
- **Folder Operations** - Basic tree operations tested, but rename/delete/move not covered
- **Worldbuilding** - Element creation tested, but rename/delete/reorganize not covered

## Test Counts

| Suite | Spec Files | Approx. Tests |
|-------|:----------:|:-------------:|
| Local | 17 | ~80 |
| Online | 21 | ~90 |
| Screenshots | 12 | ~100 |
| MCP | 6 | ~30 |
| **Total** | **56** | **~300** |
