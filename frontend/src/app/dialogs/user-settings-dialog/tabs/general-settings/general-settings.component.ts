import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { TranslocoModule } from '@jsverse/transloco';
import { TutorialService } from '@services/core/tutorial.service';

/**
 * App-wide preferences that belong to no single screen. Currently the way
 * back from the "Don't show tutorials" opt-out on the first tour card.
 */
@Component({
  selector: 'app-general-settings',
  imports: [FormsModule, MatCheckboxModule, TranslocoModule],
  templateUrl: './general-settings.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './general-settings.component.scss',
})
export class GeneralSettingsComponent {
  private readonly tutorialService = inject(TutorialService);

  get toursEnabled(): boolean {
    return this.tutorialService.toursEnabled();
  }

  set toursEnabled(value: boolean) {
    this.tutorialService.setToursEnabled(typeof value === 'boolean' && value);
  }
}
