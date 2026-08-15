import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterModule } from '@angular/router';
import { PasskeysSettingsComponent } from '@components/passkeys-settings/passkeys-settings.component';
import { TranslocoModule } from '@jsverse/transloco';
import { SystemConfigService } from '@services/core/system-config.service';

import { AuthorizedAppsComponent } from '../../dialogs/user-settings-dialog/tabs/authorized-apps/authorized-apps.component';

/**
 * Account Settings page (deep-linkable `/settings`).
 *
 * This is a thin composition of the shared account components used in the
 * settings dialog — the authorized-apps management and passkey settings —
 * so there is a single implementation of each. The settings dialog's
 * "Authorized Apps" tab renders the very same {@link AuthorizedAppsComponent}.
 */
@Component({
  selector: 'app-account-settings',
  templateUrl: './account-settings.component.html',
  styleUrls: ['./account-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatToolbarModule,
    TranslocoModule,
    AuthorizedAppsComponent,
    PasskeysSettingsComponent,
  ],
})
export class AccountSettingsComponent {
  readonly systemConfig = inject(SystemConfigService);
}
