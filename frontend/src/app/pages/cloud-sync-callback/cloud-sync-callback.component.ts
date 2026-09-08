import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CloudSyncConnectService } from '@services/cloud-sync/cloud-sync-connect.service';
import { CloudSyncEngineService } from '@services/cloud-sync/cloud-sync-engine.service';
import { LoggerService } from '@services/core/logger.service';
import {
  type CloudProvider,
  getCloudProviderDisplayName,
} from '@services/core/storage-context.service';
import { UnifiedUserService } from '@services/user/unified-user.service';

const KNOWN_PROVIDERS: readonly CloudProvider[] = [
  'dropbox',
  'google-drive',
  'onedrive',
];

/**
 * Landing page for the provider OAuth redirect:
 * `/cloud-sync/callback/:provider?code=...&state=...`
 *
 * Finishes the PKCE exchange, then either lands the user on the home page
 * (existing Inkweld folder found) or sends them to the setup page to pick a
 * profile (fresh account).
 */
@Component({
  selector: 'app-cloud-sync-callback',
  imports: [MatProgressSpinnerModule, MatButtonModule, RouterLink],
  templateUrl: './cloud-sync-callback.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './cloud-sync-callback.component.scss',
})
export class CloudSyncCallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly connect = inject(CloudSyncConnectService);
  private readonly engine = inject(CloudSyncEngineService);
  private readonly unifiedUserService = inject(UnifiedUserService);
  private readonly logger = inject(LoggerService);

  // Signals because the async continuation is the only writer and zoneless
  // change detection would otherwise never re-render.
  readonly errorMessage = signal('');
  readonly providerName = signal('cloud storage');
  /** What the spinner is doing right now */
  readonly statusMessage = signal('Connecting');

  ngOnInit(): void {
    void this.handleCallback();
  }

  private async handleCallback(): Promise<void> {
    const providerParam = this.route.snapshot.paramMap.get('provider');
    const provider = KNOWN_PROVIDERS.find(p => p === providerParam);
    if (!provider) {
      this.errorMessage.set('Unknown cloud storage provider.');
      return;
    }
    this.providerName.set(getCloudProviderDisplayName(provider));

    const query = this.route.snapshot.queryParamMap;
    const error = query.get('error');
    if (error) {
      this.errorMessage.set(
        error === 'access_denied'
          ? `You cancelled the ${this.providerName()} sign-in.`
          : (query.get('error_description') ??
              `${this.providerName()} returned an error: ${error}`)
      );
      return;
    }

    const code = query.get('code');
    const state = query.get('state');
    if (!code || !state) {
      this.errorMessage.set('The sign-in response was incomplete.');
      return;
    }

    try {
      const result = await this.connect.completeAuthorization(
        provider,
        code,
        state
      );
      if (result.kind === 'configured') {
        await this.unifiedUserService.initialize();
        // Pull the manifest and covers before showing the bookshelf, so a
        // second device does not land on an empty screen with no feedback.
        this.statusMessage.set('Fetching your projects from');
        this.engine.initialize({ runStartupPass: false });
        try {
          await this.engine.syncNow();
        } catch (syncError) {
          // The engine records the failure in its status; the bookshelf
          // still opens so the user can retry from the menu.
          this.logger.warn('CloudSync', 'Initial sync failed', syncError);
        }
        await this.router.navigate(['/'], { replaceUrl: true });
        return;
      }
      await this.router.navigate(['/setup'], {
        replaceUrl: true,
        queryParams: { cloud: provider },
      });
    } catch (err) {
      this.logger.error('CloudSync', 'Authorization callback failed', err);
      if (err instanceof Object && 'body' in err) {
        this.logger.error(
          'CloudSync',
          'Provider response body',
          JSON.stringify((err as { body: unknown }).body)
        );
      }
      this.errorMessage.set(
        err instanceof Error
          ? err.message
          : `Could not connect to ${this.providerName()}.`
      );
    }
  }
}
