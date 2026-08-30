import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { SystemConfigService } from '@services/core/system-config.service';

/**
 * Renders the instance's Privacy Policy / Terms of Service links when the
 * admin has configured them (PRIVACY_POLICY_URL / TERMS_OF_SERVICE_URL).
 * Hidden entirely when neither is set — Inkweld sets only strictly-necessary
 * cookies by default, so nothing needs to be shown.
 *
 * Used in the login and registration dialogs where legal links belong.
 */
@Component({
  selector: 'app-legal-links',
  imports: [TranslocoModule],
  templateUrl: './legal-links.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './legal-links.component.scss',
})
export class LegalLinksComponent {
  private readonly systemConfig = inject(SystemConfigService);

  readonly privacyPolicyUrl = this.systemConfig.privacyPolicyUrl;
  readonly termsUrl = this.systemConfig.termsUrl;
}
