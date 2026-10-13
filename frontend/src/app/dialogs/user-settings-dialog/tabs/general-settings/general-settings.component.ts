import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoModule } from '@jsverse/transloco';
import { PwaInstallService } from '@services/core/pwa-install.service';
import { SettingsService } from '@services/core/settings.service';
import { TutorialService } from '@services/core/tutorial.service';

/**
 * App-wide preferences that belong to no single screen: the way back from the
 * "Don't show tutorials" opt-out on the first tour card, installing the app
 * (also after its home-screen banner was dismissed), and typing behaviour.
 */
@Component({
  selector: 'app-general-settings',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    TranslocoModule,
  ],
  templateUrl: './general-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './general-settings.component.scss',
})
export class GeneralSettingsComponent {
  private readonly tutorialService = inject(TutorialService);
  private readonly settingsService = inject(SettingsService);
  protected readonly pwaInstall = inject(PwaInstallService);

  install(): void {
    void this.pwaInstall.install();
  }

  get markdownShortcuts(): boolean {
    return this.settingsService.markdownShortcuts();
  }

  setMarkdownShortcuts(value: boolean): void {
    this.settingsService.setMarkdownShortcuts(
      typeof value === 'boolean' && value
    );
  }

  get toursEnabled(): boolean {
    return this.tutorialService.toursEnabled();
  }

  setToursEnabled(value: boolean): void {
    this.tutorialService.setToursEnabled(typeof value === 'boolean' && value);
  }
}
