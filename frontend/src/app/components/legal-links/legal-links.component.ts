import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { SystemConfigService } from '@services/core/system-config.service';

/**
 * Links to the instance's /privacy and /terms pages when the admin has
 * configured either document (hosted text or an external URL — the page
 * itself decides whether to render or redirect). Hidden entirely when neither
 * is set: Inkweld sets only strictly-necessary cookies by default, so nothing
 * needs to be shown.
 *
 * Used on the pages reachable before sign-in (landing page, login and
 * registration dialogs, passkey recovery, password reset, OAuth consent,
 * about) — not /setup, which runs before a server is chosen. Links open in a
 * new tab so a half-filled form is not lost.
 */
@Component({
  selector: 'app-legal-links',
  imports: [RouterLink, TranslocoModule],
  templateUrl: './legal-links.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './legal-links.component.scss',
})
export class LegalLinksComponent {
  private readonly systemConfig = inject(SystemConfigService);

  readonly hasPrivacyPolicy = this.systemConfig.hasPrivacyPolicy;
  readonly hasTerms = this.systemConfig.hasTerms;
}
