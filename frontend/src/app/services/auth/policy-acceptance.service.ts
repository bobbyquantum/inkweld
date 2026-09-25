import { effect, inject, Injectable, Injector, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { NavigationEnd, Router } from '@angular/router';
import {
  PolicyAcceptanceDialogComponent,
  type PolicyAcceptanceDialogData,
  type PolicyAcceptanceDialogResult,
} from '@dialogs/policy-acceptance-dialog/policy-acceptance-dialog.component';
import { UsersService } from '@inkweld/index';
import { LoggerService } from '@services/core/logger.service';
import { SetupService } from '@services/core/setup.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { filter, firstValueFrom, map } from 'rxjs';

/** Pages the user must be able to read while the prompt is pending. */
const LEGAL_ROUTES = new Set(['/privacy', '/terms']);

/**
 * Asks signed-in users to accept the instance's privacy policy / terms when
 * the admin requires it (REQUIRE_POLICY_ACCEPTANCE) and the user's recorded
 * acceptance is missing or out of date — e.g. GitHub sign-ups, which skip the
 * registration checkbox, and everyone after the documents are edited.
 *
 * This is a UI gate: the API and MCP keep working for the account. It is
 * started once from AppComponent.
 */
@Injectable({ providedIn: 'root' })
export class PolicyAcceptanceService {
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly usersApi = inject(UsersService);
  private readonly setupService = inject(SetupService);
  private readonly userService = inject(UnifiedUserService);
  private readonly logger = inject(LoggerService);
  private readonly injector = inject(Injector);

  /**
   * The current path, or null until the first navigation has finished —
   * `router.url` is still '/' before then, so a fresh tab opened on /privacy
   * would otherwise be mistaken for the home page and get the prompt.
   */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects.split(/[?#]/)[0])
    ),
    { initialValue: null }
  );

  /**
   * Resolved only once a server user is signed in. Creating it at startup
   * would load the features before first-run setup has picked a server, and
   * setup navigates on without a reload, so the stale values would stick.
   */
  private systemConfig?: SystemConfigService;

  /** `${userId}:${version}` already checked, so each pair is asked once. */
  private checked: string | null = null;
  private dialogOpen = false;

  start(): void {
    effect(
      () => {
        if (
          !this.userService.isAuthenticated() ||
          this.setupService.getMode() !== 'server'
        ) {
          return;
        }
        const systemConfig = (this.systemConfig ??= untracked(() =>
          this.injector.get(SystemConfigService)
        ));
        const version = systemConfig.policyVersion();
        const user = this.userService.currentUser();
        const path = this.path();
        const shouldCheck =
          systemConfig.requirePolicyAcceptance() &&
          !!version &&
          !!user?.id &&
          path !== null &&
          !LEGAL_ROUTES.has(path);
        if (!shouldCheck) return;

        const key = `${user.id}:${version}`;
        if (key === this.checked || this.dialogOpen) return;
        this.checked = key;
        untracked(() => void this.check());
      },
      { injector: this.injector }
    );
  }

  private async check(): Promise<void> {
    let status;
    try {
      status = await firstValueFrom(this.usersApi.getPolicyAcceptance());
    } catch (error) {
      // Never lock someone out because the status call failed; the next
      // sign-in or version change asks again.
      this.logger.warn('PolicyAcceptance', 'Status check failed', error);
      return;
    }
    if (!status.needsAcceptance || !status.currentVersion) return;

    this.dialogOpen = true;
    const result = await firstValueFrom(
      this.dialog
        .open<
          PolicyAcceptanceDialogComponent,
          PolicyAcceptanceDialogData,
          PolicyAcceptanceDialogResult
        >(PolicyAcceptanceDialogComponent, {
          data: {
            version: status.currentVersion,
            isUpdate: !!status.acceptedVersion,
          },
          disableClose: true,
          closeOnNavigation: false,
          width: '480px',
          maxWidth: '95vw',
        })
        .afterClosed()
    );
    this.dialogOpen = false;

    if (result === 'accepted') {
      // Whatever version was recorded is current as far as we know.
      const current = this.systemConfig?.policyVersion();
      const user = this.userService.currentUser();
      if (current && user?.id) this.checked = `${user.id}:${current}`;
    } else {
      this.checked = null;
      await this.userService.logout();
    }
  }
}
