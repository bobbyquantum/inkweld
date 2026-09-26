import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  accountServerName,
  DeleteAccountComponent,
} from '@components/delete-account/delete-account.component';
import { LegalLinksComponent } from '@components/legal-links/legal-links.component';
import { TranslocoModule } from '@jsverse/transloco';
import { SetupService } from '@services/core/setup.service';
import {
  isLocalOrCloudMode,
  StorageContextService,
} from '@services/core/storage-context.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { UnifiedUserService } from '@services/user/unified-user.service';

type PageState = 'loading' | 'deleted' | 'local' | 'sign-in' | 'signed-in';

/**
 * Public `/delete-account` page — the web link a Google Play listing must
 * provide for account deletion. Signed in, it shows the same delete flow as
 * Settings → Account; signed out, it explains how to sign in (and returns
 * here afterwards). `?deleted=1` is where the delete flow lands.
 */
@Component({
  selector: 'app-delete-account-page',
  imports: [
    DeleteAccountComponent,
    LegalLinksComponent,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RouterLink,
    TranslocoModule,
  ],
  templateUrl: './delete-account-page.component.html',
  styleUrl: './delete-account-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteAccountPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly setupService = inject(SetupService);
  private readonly userService = inject(UnifiedUserService);
  private readonly systemConfig = inject(SystemConfigService);
  private readonly storageContext = inject(StorageContextService);

  private readonly loaded = signal(false);
  private readonly deleted =
    this.route.snapshot.queryParamMap.get('deleted') === '1';

  readonly state = computed<PageState>(() => {
    if (this.deleted) return 'deleted';
    if (isLocalOrCloudMode(this.setupService.getMode())) return 'local';
    if (!this.loaded()) return 'loading';
    return this.userService.isAuthenticated() ? 'signed-in' : 'sign-in';
  });

  readonly serverName = computed(() =>
    accountServerName(
      this.systemConfig.systemFeatures().defaultServerName,
      this.storageContext.getActiveConfig()?.serverUrl
    )
  );

  ngOnInit(): void {
    if (this.state() !== 'loading') return;
    // initialize() never rejects: a failed load leaves the user anonymous.
    void this.userService.initialize().then(() => this.loaded.set(true));
  }

  /** Go to the sign-in screen, coming back here once signed in. */
  signIn(): void {
    // The login dialog returns to this URL after a successful sign-in.
    sessionStorage.setItem('oauth_return_url', '/delete-account');
    void this.router.navigate(['/']);
  }
}
