import { inject } from '@angular/core';
import { type Routes } from '@angular/router';

import { adminGuard } from './guards/admin.guard';
import { authGuard } from './guards/auth.guard';
import { CanDeactivateProjectGuard } from './guards/can-deactivate-project.guard';
import type { ProjectComponent } from './pages/project/project.component';
import { projectTabRoutes } from './pages/project/project-tab.routes';

export const routes: Routes = [
  {
    path: 'setup',
    loadComponent: () =>
      import('./pages/setup/setup.component').then(m => m.SetupComponent),
    title: 'Setup',
    data: {
      // Recreate the page on every navigation, even one that only changes
      // the query params (/setup → /setup?mode=cloud&upgradeFrom=…): the
      // step to open is read once, in ngOnInit.
      reuseComponent: false,
    },
  },
  {
    path: 'reset',
    loadComponent: () =>
      import('./pages/reset/reset.component').then(m => m.ResetComponent),
    title: 'Reset Data',
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./pages/about/about.component').then(m => m.AboutComponent),
    title: 'About Inkweld',
  },
  {
    // Anonymous legal pages. Must stay above ':username' — 'privacy' and
    // 'terms' are also reserved usernames on the backend.
    path: 'privacy',
    loadComponent: () =>
      import('./pages/legal/legal-page.component').then(
        m => m.LegalPageComponent
      ),
    data: { document: 'privacy' },
    title: 'Privacy Policy',
  },
  {
    path: 'terms',
    loadComponent: () =>
      import('./pages/legal/legal-page.component').then(
        m => m.LegalPageComponent
      ),
    data: { document: 'terms' },
    title: 'Terms of Service',
  },
  {
    // Public account-deletion page, so deletion can be linked to directly.
    // Must stay above ':username' — 'delete-account' is a reserved username.
    path: 'delete-account',
    loadComponent: () =>
      import('./pages/delete-account/delete-account-page.component').then(
        m => m.DeleteAccountPageComponent
      ),
    title: 'Delete Account',
  },
  {
    path: 'about/changelog',
    loadComponent: () =>
      import('./pages/about/changelog/changelog.component').then(
        m => m.ChangelogComponent
      ),
    title: 'Changelog',
  },
  {
    path: 'oauth/authorize',
    loadComponent: () =>
      import('./pages/oauth-consent/oauth-consent.component').then(
        m => m.OAuthConsentComponent
      ),
    title: 'Authorize Application',
    canActivate: [authGuard],
  },
  {
    path: 'oauth/callback',
    loadComponent: () =>
      import('./pages/oauth-callback/oauth-callback.component').then(
        m => m.OAuthCallbackComponent
      ),
    title: 'Signing In...',
  },
  {
    // Cloud Sync provider OAuth redirect target. Registered verbatim with each
    // provider, so the path must not change without updating those apps.
    path: 'cloud-sync/callback/:provider',
    loadComponent: () =>
      import('./pages/cloud-sync-callback/cloud-sync-callback.component').then(
        m => m.CloudSyncCallbackComponent
      ),
    title: 'Connecting Cloud Storage...',
  },
  {
    path: '',
    loadComponent: () =>
      import('./pages/home/home.component').then(m => m.HomeComponent),
    title: 'Home',
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./pages/admin/admin.component').then(m => m.AdminComponent),
    title: 'Admin Dashboard',
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        redirectTo: 'users',
        pathMatch: 'full',
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./pages/admin/users/users.component').then(
            m => m.AdminUsersComponent
          ),
        title: 'Admin - Users',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/admin/settings/settings.component').then(
            m => m.AdminSettingsComponent
          ),
        title: 'Admin - Settings',
      },
      {
        path: 'ai-providers',
        loadComponent: () =>
          import('./pages/admin/ai-providers/ai-providers.component').then(
            m => m.AdminAiProvidersComponent
          ),
        title: 'Admin - AI Providers',
      },
      {
        path: 'ai',
        loadComponent: () =>
          import('./pages/admin/ai-settings/ai-settings.component').then(
            m => m.AdminAiSettingsComponent
          ),
        title: 'Admin - AI Image Settings',
      },
      {
        path: 'ai-text',
        loadComponent: () =>
          import('./pages/admin/ai-text-settings/ai-text-settings.component').then(
            m => m.AdminAiTextSettingsComponent
          ),
        title: 'Admin - AI Text Settings',
      },
      {
        path: 'appearance',
        loadComponent: () =>
          import('./pages/admin/appearance/appearance.component').then(
            m => m.AdminAppearanceComponent
          ),
        title: 'Admin - Appearance',
      },
      {
        path: 'announcements',
        loadComponent: () =>
          import('./pages/admin/announcements/announcements.component').then(
            m => m.AdminAnnouncementsComponent
          ),
        title: 'Admin - Announcements',
      },
      {
        path: 'email',
        loadComponent: () =>
          import('./pages/admin/email-settings/email-settings.component').then(
            m => m.AdminEmailSettingsComponent
          ),
        title: 'Admin - Email Settings',
      },
      {
        path: 'github',
        loadComponent: () =>
          import('./pages/admin/github-settings/github-settings.component').then(
            m => m.AdminGithubSettingsComponent
          ),
        title: 'Admin - GitHub Settings',
      },
      {
        path: 'image-audits',
        loadComponent: () =>
          import('./pages/admin/image-audits/image-audits.component').then(
            m => m.AdminImageAuditsComponent
          ),
        title: 'Admin - Image Audits',
      },
      {
        path: 'system-health',
        loadComponent: () =>
          import('./pages/admin/system-health/system-health.component').then(
            m => m.AdminSystemHealthComponent
          ),
        title: 'Admin - System Health',
      },
    ],
  },
  {
    path: 'create-project',
    loadComponent: () =>
      import('./pages/create-project/create-project.component').then(
        m => m.CreateProjectComponent
      ),
    title: 'Create New Project',
    canActivate: [authGuard],
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/account-settings/account-settings.component').then(
        m => m.AccountSettingsComponent
      ),
    title: 'Account Settings',
    canActivate: [authGuard],
  },
  {
    path: 'messages',
    loadComponent: () =>
      import('./pages/messages/messages.component').then(
        m => m.MessagesComponent
      ),
    title: 'Messages',
    canActivate: [authGuard],
  },
  {
    path: 'approval-pending',
    loadComponent: () =>
      import('./pages/approval-pending/approval-pending.component').then(
        m => m.ApprovalPendingComponent
      ),
    title: 'Approval Pending',
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./pages/forgot-password/forgot-password.component').then(
        m => m.ForgotPasswordComponent
      ),
    title: 'Forgot Password',
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./pages/reset-password/reset-password.component').then(
        m => m.ResetPasswordComponent
      ),
    title: 'Reset Password',
  },
  {
    // "Lost your passkey?" — collects email and triggers recovery magic-link.
    // Symmetric to /forgot-password but for the WebAuthn flow. Gated at
    // runtime by SystemConfigService.isEmailRecoveryEnabled inside the
    // component; the backend additionally returns 404 when the flag is off,
    // so a stale bookmark is harmless.
    path: 'recover-passkey',
    loadComponent: () =>
      import('./pages/recover-passkey/recover-passkey.component').then(
        m => m.RecoverPasskeyComponent
      ),
    title: 'Recover Passkey',
  },
  {
    // Magic-link redemption page. The recovery email points here with a
    // ?token=<opaque> query string. Path-style instead of query-style is
    // tempting but we follow the password-reset convention so operators can
    // reuse their existing email-rewriting/redaction rules.
    path: 'recover-passkey/redeem',
    loadComponent: () =>
      import('./pages/recover-passkey-redeem/recover-passkey-redeem.component').then(
        m => m.RecoverPasskeyRedeemComponent
      ),
    title: 'Set Up New Passkey',
  },
  {
    path: 'unavailable',
    loadComponent: () =>
      import('./pages/unavailable/unavailable.component').then(
        m => m.UnavailableComponent
      ),
    title: 'Service Unavailable',
  },
  {
    path: 'public/:username/:slug',
    loadComponent: () =>
      import('./pages/project/project.component').then(m => m.ProjectComponent),
    data: { reuseComponent: false },
    children: projectTabRoutes,
  },
  // Project route (GitHub style: /:username/:slug)
  {
    path: ':username/:slug',
    loadComponent: () =>
      import('./pages/project/project.component').then(m => m.ProjectComponent),
    // Title is set dynamically by ProjectComponent based on project name
    canActivate: [authGuard],
    canDeactivate: [
      (component: ProjectComponent) =>
        inject(CanDeactivateProjectGuard).canDeactivate(component),
    ],
    data: {
      // CustomRouteReuseStrategy ignores this flag for the project itself
      // (reused within one project, recreated for another; leaving destroys
      // it, so ngOnDestroy closes its collaboration connections). The home
      // tab (empty path) inherits it, so like the other tabs it is recreated
      // rather than reused in place.
      reuseComponent: false,
    },
    children: projectTabRoutes,
  },
  // Old routes for files and documents have been replaced by tab components
  // User profile route. Deliberately unguarded: public profiles must be
  // reachable by anonymous visitors, and the server enforces visibility.
  {
    path: ':username',
    loadComponent: () =>
      import('./pages/user-profile/user-profile.component').then(
        m => m.UserProfileComponent
      ),
    title: 'User Profile',
  },
  {
    matcher: url => {
      if (
        url.length > 0 &&
        (url[0].path.startsWith('oauth2') ||
          url[0].path.startsWith('login/oauth2'))
      ) {
        return null;
      }
      return { consumed: [] };
    },
    children: [],
  },
  {
    path: '**',
    loadComponent: () =>
      import('./pages/not-found/not-found.component').then(
        m => m.NotFoundComponent
      ),
    title: '404 - Page Not Found',
  },
];
