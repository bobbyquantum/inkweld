import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { compareVersions } from '@utils/release-notes';
import { take } from 'rxjs';

import { environment } from '../../../environments/environment';

/** The last app version this browser has announced (or first ran). */
export const LAST_SEEN_VERSION_KEY = 'inkweld-last-seen-version';

/**
 * Record `version` as announced so its notice doesn't show. A plain function
 * so `UpdateService` can call it without injecting this service (which would
 * pull Router and Transloco into everything that injects `UpdateService`).
 */
export function markVersionSeen(version: string): void {
  try {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
  } catch {
    // Storage unavailable (private mode); the notice can't persist anyway.
  }
}

/** How long the "updated" notice stays up. */
const NOTICE_DURATION_MS = 10_000;

/**
 * Tells the user once per version, with a snackbar linking to the changelog,
 * that the app has been updated.
 *
 * The notice is deliberately quiet (no dialog) because it shows once on every
 * device and browser the user opens. A first run records the version without
 * a notice, and accepting the update dialog (which already listed the
 * highlights) marks the new version as seen (`markVersionSeen`) so the reload
 * stays quiet.
 */
@Injectable({
  providedIn: 'root',
})
export class WhatsNewService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  /** The running app's version. */
  readonly currentVersion: string = environment.version;

  /** Show the notice if this browser last ran an older version. */
  initialize(): void {
    const lastSeen = this.readLastSeen();
    markVersionSeen(this.currentVersion);
    if (lastSeen === null) return;
    if ((compareVersions(this.currentVersion, lastSeen) ?? 0) <= 0) return;

    // This runs at startup, so wait for the translations to load.
    this.transloco
      .selectTranslation()
      .pipe(take(1))
      .subscribe(() => this.showNotice());
  }

  private showNotice(): void {
    const ref = this.snackBar.open(
      this.transloco.translate('app.whatsNew.updated', {
        version: this.currentVersion,
      }),
      this.transloco.translate('app.whatsNew.action'),
      { duration: NOTICE_DURATION_MS }
    );
    ref.onAction().subscribe(() => {
      void this.router.navigateByUrl('/about/changelog');
    });
  }

  private readLastSeen(): string | null {
    try {
      return localStorage.getItem(LAST_SEEN_VERSION_KEY);
    } catch {
      return null;
    }
  }
}
