import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AiPreferenceInfoDialogComponent } from '@dialogs/ai-preference-info-dialog/ai-preference-info-dialog.component';
import { TooltipAriaLabelDirective } from '@directives/tooltip-aria-label.directive';
import { TranslocoModule } from '@jsverse/transloco';
import { SettingsService } from '@services/core/settings.service';

export type AiChoice = 'none' | 'allow';

/**
 * The user's "No AI / Allow AI" choice (`SettingsService.aiAllowed`) as an
 * M3 segmented button (Angular Material's button toggle under the M3 theme),
 * with a help button that explains what each option turns on. "No AI" is the
 * default: every AI feature in Inkweld is opt-in, and the choice can turn AI
 * off even where the admin has it on.
 *
 * `floating` gives both controls a frosted surface so they stay readable over
 * the background image on /setup.
 */
@Component({
  selector: 'app-ai-preference',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatTooltipModule,
    TooltipAriaLabelDirective,
    TranslocoModule,
  ],
  templateUrl: './ai-preference.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './ai-preference.component.scss',
})
export class AiPreferenceComponent {
  private readonly settings = inject(SettingsService);
  private readonly dialog = inject(MatDialog);

  readonly floating = input(false);

  protected readonly options: readonly { value: AiChoice; label: string }[] = [
    { value: 'none', label: 'settings.generalTab.aiNone' },
    { value: 'allow', label: 'settings.generalTab.aiAllow' },
  ];

  protected readonly selected = computed<AiChoice>(() =>
    this.settings.aiAllowed() ? 'allow' : 'none'
  );

  choose(value: AiChoice): void {
    this.settings.setAiAllowed(value === 'allow');
  }

  openInfo(): void {
    this.dialog.open(AiPreferenceInfoDialogComponent, {
      width: '520px',
      maxWidth: 'calc(100vw - 32px)',
      autoFocus: 'dialog',
    });
  }
}
