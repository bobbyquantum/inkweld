import { isDevMode } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';

const enTranslations = {
  cancel: 'Cancel',
  close: 'Close',
  dismiss: 'Dismiss',
  retry: 'Retry',
  refresh: 'Refresh',
  clear: 'Clear',
  errors: {
    unknown: 'Something went wrong. Please try again.',
  },
  app: {
    updateNow: 'Update Now',
    sessionExpiredMessage:
      'Your session has expired. Please re-authenticate or continue offline.',
    reAuthenticate: 'Re-authenticate',
    continueOffline: 'Continue Offline',
  },
  login: {
    title: 'Login to Inkweld',
    signInWithPasskey: 'Sign in with passkey',
    waitingForPasskey: 'Waiting for passkey...',
    lostPasskey: 'Lost your passkey?',
    username: 'Username',
    password: 'Password',
    login: 'Login',
    loggingIn: 'Logging in...',
    forgotPassword: 'Forgot password?',
    noAccountRegister: "Don't have an account? Register here",
    enterBothFields: 'Please enter both username and password.',
    welcomeBack: 'Welcome back, {{username}}!',
    invalidCredentials: 'Invalid username or password',
    loginFailedGeneric: 'Login failed. Please try again.',
    passkeyLoginFailed: 'Passkey login failed. Please try again.',
    errors: {
      loginFailed: 'Invalid username or password',
      verificationFailed: 'Passkey verification failed. Please try again.',
      networkError:
        'Network error. Please check your connection and try again.',
      unsupported: 'Passkeys are not supported by this browser.',
      accountDisabled:
        'Your account has been disabled. Please contact an administrator.',
    },
  },
  home: {
    searchProjects: 'Search projects',
    closeSearch: 'Close search',
    toggleNavMenu: 'Toggle navigation menu',
    closeNavigation: 'Close navigation',
    syncAll: 'Sync All',
    create: 'Create',
    createOrImport: 'Create or import project',
    newProject: 'New Project',
    importProject: 'Import Project',
    login: 'Login',
    register: 'Register',
    loadingProjects: 'Loading projects...',
    failedToLoad: 'Failed to load projects',
    serverConnectionError: 'There was a problem connecting to the server',
    pendingInvitations: 'Pending Invitations',
    byOwner: 'by {{owner}}',
    decline: 'Decline',
    accept: 'Accept',
    createFirstProject: 'Create Your First Project',
    getStarted: 'Get started by creating a new project or importing one',
    createProject: 'Create Project',
    noProjectsFound: 'No projects found',
    tryDifferentSearch: 'Try a different search term',
    openProject: 'Open project {{title}}',
    cancelSyncTooltip: 'Cancel sync ({{progress}}% complete)',
    tooltips: {
      onlineOnly: 'Only available in online mode',
      offline: 'Cannot sync while offline',
      syncInProgress: 'Sync in progress...',
      noProjectsToSync: 'No projects to sync',
      noActivatedProjects: 'No activated projects to sync',
      syncCount: 'Sync {{count}} activated project(s)',
    },
    snackbar: {
      noActivatedToSync: 'No activated projects to sync',
      activatedSyncing: '"{{title}}" activated — syncing now',
      activateFailed: 'Failed to activate project',
      deactivated: '"{{title}}" deactivated',
      deactivateFailed: 'Failed to deactivate project',
      syncCancelled: 'Sync cancelled',
      projectImported: 'Project imported successfully!',
      view: 'View',
      nowCollaborator: 'You are now a collaborator on "{{title}}"',
      acceptInvitationFailed: 'Failed to accept invitation',
      invitationDeclined: 'Invitation declined',
      declineInvitationFailed: 'Failed to decline invitation',
    },
    dialogs: {
      activateTitle: 'Activate Project',
      activateMessage:
        'Activate "{{title}}" on this device? This will download all project data.',
      activate: 'Activate',
      deactivateTitle: 'Deactivate Project',
      deactivateMessage:
        'Deactivate "{{title}}"? All local data for this project will be removed from this device. You can reactivate it anytime.',
      deactivate: 'Deactivate',
    },
  },
};

export function translocoTestProvider() {
  return TranslocoTestingModule.forRoot({
    translocoConfig: {
      availableLangs: [{ id: 'en', label: 'English' }],
      defaultLang: 'en',
      fallbackLang: 'en',
      reRenderOnLangChange: true,
      prodMode: !isDevMode(),
      missingHandler: {
        logMissingKey: false,
        useFallbackTranslation: true,
        allowEmpty: false,
      },
      scopes: {
        autoPrefixKeys: false,
      },
    },
    preloadLangs: true,
    langs: { en: enTranslations },
  });
}
