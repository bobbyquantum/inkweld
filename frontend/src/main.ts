import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { relayGoogleAuthResponse } from './app/services/cloud-sync/google-drive/google-auth';
import { captureInstallPromptEarly } from './app/services/core/pwa-install.service';

// A Google Drive token renewal lands in a hidden iframe or a popup. Hand the
// token to the Inkweld tab instead of starting a second copy of the app there.
if (!relayGoogleAuthResponse()) {
  // The browser's install offer can arrive before Angular has started.
  captureInstallPromptEarly();
  bootstrapApplication(AppComponent, appConfig).catch((err: unknown) => {
    console.error(err);
  });
}
