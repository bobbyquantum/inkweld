import { effect, inject, Injectable, Injector, untracked } from '@angular/core';
import { UsersService } from '@inkweld/index';
import { firstValueFrom } from 'rxjs';

import { LoggerService } from '../core/logger.service';
import { SettingsService } from '../core/settings.service';
import { SetupService } from '../core/setup.service';
import { UserService } from './user.service';

/**
 * Keeps the "No AI / Allow AI" choice the same on every device by storing it
 * on the server account (`aiAllowed` on `GET`/`PATCH /users/me`).
 *
 * The browser keeps its own copy (`SettingsService.aiAllowed`), which is what
 * the app reads and what /setup and Browser mode use. Once a server account is
 * signed in:
 *
 * - a change made in this browser that the account doesn't have yet (on
 *   /setup, offline, or just now) is sent to the account;
 * - otherwise the account's choice replaces the browser's;
 * - an account that has never chosen takes this browser's choice, if the
 *   browser has one (an upgrade from the per-browser setting).
 *
 * A failed send stays pending and is retried the next time the user is
 * refreshed from the server (reconnect, reload) or the choice changes.
 * Servers that predate the field leave `aiAllowed` out, and nothing is sent.
 */
@Injectable({ providedIn: 'root' })
export class AiPreferenceSyncService {
  private readonly settings = inject(SettingsService);
  private readonly userService = inject(UserService);
  private readonly setupService = inject(SetupService);
  private readonly usersApi = inject(UsersService);
  private readonly logger = inject(LoggerService);
  private readonly injector = inject(Injector);

  private started = false;
  private sending = false;

  /** Start following the user and the choice. Called once from `AppComponent`. */
  start(): void {
    if (this.started) return;
    this.started = true;
    effect(
      () => {
        const user = this.userService.currentUser();
        const local = this.settings.aiAllowed();
        const unsynced = this.settings.aiChoiceUnsynced();
        untracked(() => this.reconcile(user.aiAllowed, local, unsynced));
      },
      { injector: this.injector }
    );
  }

  private reconcile(
    account: boolean | null | undefined,
    local: boolean,
    unsynced: boolean
  ): void {
    if (!this.setupService.isServerMode()) return;
    if (!this.userService.isAuthenticated()) return;
    // Not in this response (an older server, or a sign-in response without
    // it): nothing to compare against yet.
    if (account === undefined) return;

    if (unsynced || (account === null && this.settings.hasLocalAiChoice())) {
      void this.send(local);
    } else if (account !== null && account !== local) {
      this.settings.applyAccountAiChoice(account);
    }
  }

  private async send(value: boolean): Promise<void> {
    // One request at a time. A change made meanwhile keeps the unsynced flag
    // set and is sent once this one is done.
    if (this.sending) return;
    this.sending = true;
    try {
      const updated = await firstValueFrom(
        this.usersApi.updateProfile({ aiAllowed: value })
      );
      await this.stored(updated.aiAllowed, value);
    } catch (error) {
      this.logger.warn(
        'AiPreferenceSync',
        'Could not save the AI choice to the account; will retry',
        error
      );
      return;
    } finally {
      this.sending = false;
    }
    if (this.settings.aiChoiceUnsynced()) {
      this.reconcile(
        this.userService.currentUser().aiAllowed,
        this.settings.aiAllowed(),
        true
      );
    }
  }

  /** Record what the account now holds, in the cached user and the flag. */
  private async stored(
    stored: boolean | null | undefined,
    sent: boolean
  ): Promise<void> {
    if (stored === undefined) return; // The server doesn't keep the choice.
    if (stored !== sent) {
      throw new Error(`The account kept ${String(stored)}, not ${sent}`);
    }
    const user = this.userService.currentUser();
    if (this.userService.isAuthenticated() && user.aiAllowed !== stored) {
      // Merge rather than replace: the PATCH response leaves out fields such
      // as authProvider that the cached user has.
      await this.userService.setCurrentUser({ ...user, aiAllowed: stored });
    }
    this.settings.markAiChoiceSynced(stored);
  }
}
