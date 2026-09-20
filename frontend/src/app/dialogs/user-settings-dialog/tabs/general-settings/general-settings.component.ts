import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoModule } from '@jsverse/transloco';
import { TutorialService } from '@services/core/tutorial.service';

/**
 * App-wide preferences that belong to no single screen. Currently the way
 * back from the "Don't show tutorials" opt-out on the first tour card.
 */
@Component({
  selector: 'app-general-settings',
  imports: [MatSlideToggleModule, TranslocoModule],
  templateUrl: './general-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './general-settings.component.scss',
})
export class GeneralSettingsComponent {
  private readonly tutorialService = inject(TutorialService);

  get toursEnabled(): boolean {
    return this.tutorialService.toursEnabled();
  }

  setToursEnabled(value: boolean): void {
    this.tutorialService.setToursEnabled(typeof value === 'boolean' && value);
  }
}
