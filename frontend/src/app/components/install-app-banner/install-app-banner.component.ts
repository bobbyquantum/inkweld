import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import { PwaInstallService } from '@services/core/pwa-install.service';

/**
 * Home-screen card offering to install Inkweld as an app. Renders nothing
 * unless {@link PwaInstallService.showBanner} is true.
 */
@Component({
  selector: 'app-install-app-banner',
  imports: [MatButtonModule, MatIconModule, TranslocoModule],
  templateUrl: './install-app-banner.component.html',
  styleUrl: './install-app-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallAppBannerComponent {
  protected readonly pwaInstall = inject(PwaInstallService);

  protected install(): void {
    void this.pwaInstall.install();
  }

  protected dismiss(): void {
    this.pwaInstall.dismiss();
  }
}
